const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(__dirname, 'data');
const STATE_PATH = path.join(DATA_DIR, 'state.json');
const TOKEN_SECRET = process.env.TOKEN_SECRET || 'iegaa2-local-secret-change-me';
const PORT = Number(process.env.PORT || 3000);

const GRUPOS = [
  '6-1','6-2','8-1','8-2','9-1','9-2','9-3','9-4','9-5','9-6',
  '10-1','10-2','10-3','10-4','10-5','10-6','10-7',
  '11-1','11-2','11-3','11-4','11-5','11-6','11-7'
];

const PROFESORES = [
  'Wilmer Ríos','Ruth Estrada','Rubén Darío Gómez','Yesica Mosquera',
  'Nevardo Alzate','Jorge Omar Velásquez','Diana Ramírez','Alexandra Giraldo',
  'Vilma Ospina','Henry Durango','Natalia Agudelo','Cristina Carmona',
  'Mauricio Toro','Andrea Orrego','Natalia Cano','Paola Castañeda',
  'Freddy Fernández','Eduard Tobón','Alejandro Gutiérrez','Luz Nodier García',
  'Gabriel Graciano','Luis Fernando Velásquez','Mauricio Valencia','Daniel José Muñoz',
  'Manedy','Ruth Valencia','Laura','Daniel','Yan Pol','María Eugenia',
  'Jonny','Jonathan','Gabriel','Leady','Armando','Miguel','Fredy','Ángela','Echandía','Keila'
];

const LIBRE = 'LIBRE';
const HORARIO_BLOQUES = [
  { hora: '6:00', etiqueta: '6:00 - 6:55' },
  { hora: '7:00', etiqueta: '6:55 - 7:50' },
  { hora: '8:00', etiqueta: '7:50 - 8:45' },
  { hora: '9:00', etiqueta: '8:45 - 9:15 (DESCANSO)' },
  { hora: '10:00', etiqueta: '9:15 - 10:10' },
  { hora: '11:00', etiqueta: '10:10 - 11:00' },
  { hora: '12:00', etiqueta: '11:00 - 11:50' },
  { hora: '13:00', etiqueta: '11:50 - 14:00 (DESCANSO)' },
  { hora: '14:00', etiqueta: '14:00 - 14:45' },
  { hora: '15:00', etiqueta: '15:00 - 15:45' }
];

const HORAS = HORARIO_BLOQUES.map(bloque => bloque.hora);
const GRUPOS_SALIDA_1150 = new Set(['6-1', '6-2', '8-1', '8-2']);
const DIAS = ['Lunes','Martes','Miércoles','Jueves','Viernes'];
const MATERIAS = [
  'Matemáticas','Español','Ciencias Naturales','Historia','Geografía',
  'Educación Física','Inglés','Arte','Ética','Filosofía','Química','Física','Biología'
];

const ROLE_LABELS = {
  administrador: 'Administrador',
  coordinador: 'Coordinador',
  profesor: 'Profesor'
};

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(ROOT_DIR, { extensions: ['html'] }));

let state = null;
let writeQueue = Promise.resolve();

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function generateHorarioBase() {
  const horario = {};
  DIAS.forEach(dia => {
    horario[dia] = {};
    HORAS.forEach(hora => {
      horario[dia][hora] = {};
      GRUPOS.forEach(grupo => {
        const profIdx = Math.floor((dia.charCodeAt(0) + hora.charCodeAt(0) + grupo.charCodeAt(0)) % PROFESORES.length);
        const matIdx = Math.floor((dia.charCodeAt(1) + hora.charCodeAt(1) + grupo.charCodeAt(1)) % MATERIAS.length);
        horario[dia][hora][grupo] = {
          profesor: PROFESORES[profIdx],
          materia: MATERIAS[matIdx]
        };
      });
    });
  });
  return horario;
}

function getHorarioLabel(hora) {
  return HORARIO_BLOQUES.find(bloque => bloque.hora === hora)?.etiqueta || hora;
}

function isSalida1150Slot(grupo, hora) {
  return GRUPOS_SALIDA_1150.has(grupo) && getHourIndex(hora) >= getHourIndex('13:00');
}

function normalizeSalida1150Schedule(schedule) {
  let changed = false;
  DIAS.forEach(dia => {
    const daySchedule = schedule[dia] || (schedule[dia] = {});
    HORAS.forEach(hora => {
      const hourSchedule = daySchedule[hora] || (daySchedule[hora] = {});
      GRUPOS_SALIDA_1150.forEach(grupo => {
        const slot = hourSchedule[grupo];
        if (!slot || slot.profesor !== LIBRE || slot.materia !== LIBRE || slot.aula) {
          hourSchedule[grupo] = { profesor: LIBRE, materia: LIBRE, aula: '' };
          changed = true;
        }
      });
    });
  });
  return changed;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password, hashed) {
  if (!hashed || !hashed.includes(':')) return false;
  const [salt, key] = hashed.split(':');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  const left = Buffer.from(key, 'hex');
  const right = Buffer.from(derived, 'hex');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', TOKEN_SECRET).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const [body, signature] = token.split('.');
  const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(body).digest('base64url');
  if (signature.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function createInitialState() {
  return {
    users: [
      {
        id: 1,
        usuario: '1034918343',
        nombre: 'Administrador',
        rol: 'administrador',
        email: 'admin@colegio.edu.co',
        passwordHash: hashPassword('G1034918343')
      }
    ],
    sequences: {
      user: 2,
      absence: 1,
      novedad: 1,
      info: 1
    },
    horarioBase: generateHorarioBase(),
    horarioNovedades: null,
    ausencias: [],
    novedades: [],
    informacion: [],
    auditLog: []
  };
}

async function ensureState() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STATE_PATH)) {
    const initial = createInitialState();
    initial.horarioNovedades = deepClone(initial.horarioBase);
    await fsp.writeFile(STATE_PATH, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }

  try {
    const raw = await fsp.readFile(STATE_PATH, 'utf8');
    const loaded = JSON.parse(raw);
    if (!loaded.horarioNovedades) loaded.horarioNovedades = deepClone(loaded.horarioBase || generateHorarioBase());
    if (!loaded.sequences) loaded.sequences = { user: 2, absence: 1, novedad: 1, info: 1 };
    const base = loaded.horarioBase || generateHorarioBase();
    const changedBase = normalizeSalida1150Schedule(base);
    const novedades = loaded.horarioNovedades || deepClone(base);
    const changedNovedades = normalizeSalida1150Schedule(novedades);
    loaded.horarioBase = base;
    loaded.horarioNovedades = novedades;
    if (changedBase || changedNovedades) {
      await fsp.writeFile(STATE_PATH, JSON.stringify(loaded, null, 2), 'utf8');
    }
    return loaded;
  } catch {
    const initial = createInitialState();
    normalizeSalida1150Schedule(initial.horarioBase);
    initial.horarioNovedades = deepClone(initial.horarioBase);
    await fsp.writeFile(STATE_PATH, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
}

function queueSave() {
  writeQueue = writeQueue
    .then(() => fsp.writeFile(STATE_PATH, JSON.stringify(state, null, 2), 'utf8'))
    .catch(error => {
      console.error('No se pudo guardar el estado:', error);
    });
  return writeQueue;
}

function publicUser(user) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}

function toLowerSafe(value) {
  return String(value || '').trim().toLowerCase();
}

function getDateKey(dateValue) {
  if (!dateValue) return null;
  const date = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return DIAS[date.getDay() - 1] || null;
}

function formatDate(isoDate) {
  if (!isoDate) return '-';
  const date = new Date(`${isoDate}T12:00:00`);
  return date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getHourIndex(hour) {
  return HORAS.indexOf(hour);
}

function getTeacherClasses(schedule, day, teacher) {
  const dayData = schedule[day] || {};
  const classes = [];
  HORAS.forEach(hora => {
    const row = dayData[hora] || {};
    GRUPOS.forEach(grupo => {
      const slot = row[grupo];
      if (slot && slot.profesor === teacher) {
        classes.push({ hora, grupo, materia: slot.materia });
      }
    });
  });
  return classes.sort((a, b) => getHourIndex(a.hora) - getHourIndex(b.hora));
}

function getOccupiedTeachers(schedule, day, hour, excludeTeacher) {
  const occupied = new Set();
  const dayData = schedule[day] || {};
  const row = dayData[hour] || {};
  Object.values(row).forEach(slot => {
    if (slot && slot.profesor && slot.profesor !== excludeTeacher) occupied.add(slot.profesor);
  });
  return occupied;
}

function findSubstitute(schedule, day, hour, absentTeacher, reservedByHour) {
  const occupied = getOccupiedTeachers(schedule, day, hour, absentTeacher);
  for (const teacher of PROFESORES) {
    if (teacher === absentTeacher) continue;
    if (occupied.has(teacher)) continue;
    if (reservedByHour.has(teacher)) continue;
    return teacher;
  }
  return null;
}

function buildInfoMessage(group, affectedSlots) {
  const ordered = [...affectedSlots].sort((a, b) => getHourIndex(a.hora) - getHourIndex(b.hora));
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  const firstIndex = getHourIndex(first.hora);
  const lastIndex = getHourIndex(last.hora);

  if (firstIndex === 0 && lastIndex < HORAS.length - 1) {
    const nextHour = HORAS[lastIndex + 1];
    return `${group} entra a las ${nextHour}`;
  }

  if (lastIndex === HORAS.length - 1 && firstIndex > 0) {
    return `${group} sale a las ${first.hora}`;
  }

  if (firstIndex === 0 && lastIndex === HORAS.length - 1) {
    return `${group} presenta ajustes durante toda la jornada`;
  }

  const affectedHours = ordered.map(slot => slot.hora).join(', ');
  return `${group} presenta novedades en las horas ${affectedHours}`;
}

function processAbsence(stateRef, absence) {
  const day = getDateKey(absence.fecha);
  if (!day) {
    return {
      day: null,
      clases: [],
      gruposAfectados: [],
      informacion: [],
      mensaje: 'Fecha inválida'
    };
  }

  if (!DIAS.includes(day)) {
    return {
      day,
      clases: [],
      gruposAfectados: [],
      informacion: [],
      mensaje: 'No es un día hábil'
    };
  }

  const schedule = stateRef.horarioNovedades || (stateRef.horarioNovedades = deepClone(stateRef.horarioBase));
  const classes = getTeacherClasses(schedule, day, absence.profesor);
  if (!classes.length) {
    return {
      day,
      clases: [],
      gruposAfectados: [],
      informacion: [],
      mensaje: 'Sin clases ese día'
    };
  }

  const reservedByHour = new Map();
  const results = [];
  const affectedGroups = new Set();
  const affectedByGroup = new Map();

  for (const clase of classes) {
    const hourReservations = reservedByHour.get(clase.hora) || new Set();
    const substitute = findSubstitute(schedule, day, clase.hora, absence.profesor, hourReservations);
    const slot = schedule[day]?.[clase.hora]?.[clase.grupo];
    if (!slot) continue;

    if (substitute) {
      schedule[day][clase.hora][clase.grupo] = {
        ...slot,
        profesor: substitute,
        afectada: false,
        entradaTarde: false,
        salidaTemprana: false,
        sustituye: absence.profesor
      };
      hourReservations.add(substitute);
      reservedByHour.set(clase.hora, hourReservations);
      results.push({ ...clase, sustituto: substitute, afectada: false });
    } else {
      schedule[day][clase.hora][clase.grupo] = {
        ...slot,
        afectada: true,
        entradaTarde: false,
        salidaTemprana: false
      };
      results.push({ ...clase, sustituto: null, afectada: true });
      affectedGroups.add(clase.grupo);
      const groupList = affectedByGroup.get(clase.grupo) || [];
      groupList.push(clase);
      affectedByGroup.set(clase.grupo, groupList);
    }
  }

  const infoRecords = [];

  for (const [group, groupAffected] of affectedByGroup.entries()) {
    const dayClasses = HORAS.map(hora => ({
      hora,
      slot: schedule[day]?.[hora]?.[group]
    })).filter(item => item.slot);

    const firstClass = dayClasses[0];
    const lastClass = dayClasses[dayClasses.length - 1];
    const firstAffected = groupAffected.sort((a, b) => getHourIndex(a.hora) - getHourIndex(b.hora))[0];
    const lastAffected = groupAffected.sort((a, b) => getHourIndex(a.hora) - getHourIndex(b.hora)).slice(-1)[0];

    if (firstClass && firstAffected && firstAffected.hora === firstClass.hora) {
      schedule[day][firstAffected.hora][group].entradaTarde = true;
    }
    if (lastClass && lastAffected && lastAffected.hora === lastClass.hora) {
      schedule[day][lastAffected.hora][group].salidaTemprana = true;
    }

    infoRecords.push({
      id: `info_${stateRef.sequences.info++}`,
      fecha: absence.fecha,
      grupo: group,
      mensaje: buildInfoMessage(group, groupAffected),
      tipo: 'novedad',
      creada: new Date().toISOString(),
      ausenciaId: absence.id,
      profesor: absence.profesor
    });
  }

  if (results.length) {
    stateRef.novedades.push({
      id: `nov_${stateRef.sequences.novedad++}`,
      fecha: absence.fecha,
      profesor: absence.profesor,
      descripcion: `Ausencia procesada. ${affectedGroups.size} grupo(s) afectados.`,
      gruposAfectados: [...affectedGroups],
      tipo: 'ausencia',
      creada: new Date().toISOString()
    });
  }

  if (infoRecords.length) {
    stateRef.informacion.push(...infoRecords);
  }

  return {
    day,
    clases: results,
    gruposAfectados: [...affectedGroups],
    informacion: infoRecords,
    mensaje: results.length ? 'Ausencia procesada' : 'Sin cambios'
  };
}

function dashboardSummary(stateRef) {
  const today = new Date().toISOString().slice(0, 10);
  const novedadesHoy = stateRef.novedades.filter(item => item.fecha === today).length;
  const ausenciasPendientes = stateRef.ausencias.filter(item => item.estado === 'pendiente').length;

  const months = {};
  for (let index = 5; index >= 0; index -= 1) {
    const date = new Date();
    date.setMonth(date.getMonth() - index);
    const key = date.toLocaleDateString('es-CO', { month: 'short', year: '2-digit' });
    months[key] = 0;
  }

  stateRef.ausencias.forEach(absence => {
    if (!absence.fecha) return;
    const key = new Date(`${absence.fecha}T12:00:00`).toLocaleDateString('es-CO', { month: 'short', year: '2-digit' });
    if (months[key] !== undefined) months[key] += 1;
  });

  const teacherCounts = {};
  stateRef.ausencias.forEach(absence => {
    teacherCounts[absence.profesor] = (teacherCounts[absence.profesor] || 0) + 1;
  });

  const groupCounts = {};
  stateRef.informacion.forEach(info => {
    if (!info.grupo) return;
    groupCounts[info.grupo] = (groupCounts[info.grupo] || 0) + 1;
  });

  return {
    resumen: {
      gruposActivos: GRUPOS.length,
      docentes: PROFESORES.length,
      ausenciasPendientes,
      novedadesHoy
    },
    ausenciasPorMes: months,
    docentesConMasAusencias: Object.entries(teacherCounts).sort((a, b) => b[1] - a[1]).slice(0, 6),
    gruposMasAfectados: Object.entries(groupCounts).sort((a, b) => b[1] - a[1]).slice(0, 6),
    novedadesRecientes: [...stateRef.novedades].slice(-4).reverse(),
    totalAusencias: stateRef.ausencias.length
  };
}

function ensureAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
  const token = bearer || req.headers['x-access-token'];
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ message: 'Autenticación requerida' });
  }

  const user = state.users.find(item => item.id === payload.sub);
  if (!user) {
    return res.status(401).json({ message: 'Sesión inválida' });
  }

  req.user = publicUser(user);
  req.token = token;
  next();
}

function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Autenticación requerida' });
    }
    if (!roles.includes(req.user.rol)) {
      return res.status(403).json({ message: 'No tienes permisos para esta acción' });
    }
    next();
  };
}

function nextId(scope) {
  state.sequences[scope] += 1;
  return state.sequences[scope] - 1;
}

function normalizeUserInput(input) {
  return {
    nombre: String(input.nombre || '').trim(),
    usuario: String(input.usuario || '').trim(),
    contrasena: String(input.contrasena || '').trim(),
    rol: String(input.rol || '').trim(),
    email: String(input.email || '').trim()
  };
}

function canManageUsers(role) {
  return role === 'administrador';
}

function canManageAbsences(role) {
  return role === 'administrador' || role === 'coordinador';
}

function canManageBaseSchedule(role) {
  return role === 'administrador';
}

function canViewSchedule(role) {
  return role === 'administrador' || role === 'coordinador' || role === 'profesor';
}

function canViewInfo(role) {
  return role === 'administrador' || role === 'coordinador' || role === 'profesor';
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'iegaa2-platforma-educativa' });
});

app.get('/api/catalogs', ensureAuth, (_req, res) => {
  res.json({
    grupos: GRUPOS,
    profesores: PROFESORES,
    horas: HORAS,
    dias: DIAS,
    materias: MATERIAS,
    roles: Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }))
  });
});

app.post('/api/auth/login', async (req, res) => {
  const usuario = String(req.body.usuario || '').trim();
  const contrasena = String(req.body.contrasena || '').trim();

  if (!usuario || !contrasena) {
    return res.status(400).json({ message: 'Usuario y contraseña son obligatorios' });
  }

  const user = state.users.find(item => item.usuario === usuario);
  if (!user || !verifyPassword(contrasena, user.passwordHash)) {
    return res.status(401).json({ message: 'Usuario o contraseña incorrectos' });
  }

  const token = signToken({ sub: user.id, rol: user.rol, exp: Date.now() + (1000 * 60 * 60 * 8) });
  res.json({ token, user: publicUser(user) });
});

app.get('/api/auth/me', ensureAuth, (req, res) => {
  res.json({ user: req.user });
});

app.get('/api/dashboard', ensureAuth, (_req, res) => {
  res.json(dashboardSummary(state));
});

app.get('/api/horarios/base', ensureAuth, (req, res) => {
  if (!canViewSchedule(req.user.rol)) {
    return res.status(403).json({ message: 'No tienes permisos para ver horarios' });
  }
  res.json({ horario: state.horarioBase });
});

app.get('/api/horarios/novedades', ensureAuth, (req, res) => {
  if (!canViewSchedule(req.user.rol)) {
    return res.status(403).json({ message: 'No tienes permisos para ver horarios' });
  }
  res.json({ horario: state.horarioNovedades || deepClone(state.horarioBase) });
});

app.put('/api/horarios/base', ensureAuth, async (req, res) => {
  if (!canManageBaseSchedule(req.user.rol)) {
    return res.status(403).json({ message: 'Solo el administrador puede modificar el horario base' });
  }

  const { dia, hora, grupo, profesor, materia, aula = '' } = req.body;
  const profesorNormalizado = String(profesor || '').trim();
  const materiaNormalizada = String(materia || '').trim();
  const aulaNormalizada = String(aula || '').trim();
  const esLibre = profesorNormalizado === LIBRE || materiaNormalizada === LIBRE;

  if (!DIAS.includes(dia) || !HORAS.includes(hora) || !GRUPOS.includes(grupo) || !profesorNormalizado || (!esLibre && !materiaNormalizada)) {
    return res.status(400).json({ message: 'Datos inválidos para modificar el horario' });
  }

  state.horarioBase[dia] = state.horarioBase[dia] || {};
  state.horarioBase[dia][hora] = state.horarioBase[dia][hora] || {};
  state.horarioBase[dia][hora][grupo] = isSalida1150Slot(grupo, hora)
    ? { profesor: LIBRE, materia: LIBRE, aula: '' }
    : esLibre
      ? { profesor: LIBRE, materia: LIBRE, aula: '' }
      : { profesor: profesorNormalizado, materia: materiaNormalizada, aula: aulaNormalizada };
  state.horarioNovedades = deepClone(state.horarioBase);
  state.auditLog.push({
    id: `audit_${Date.now()}`,
    tipo: 'horario_base_modificado',
    usuario: req.user.nombre,
    fecha: new Date().toISOString(),
    detalle: { dia, hora, grupo, profesor: state.horarioBase[dia][hora][grupo].profesor, materia: state.horarioBase[dia][hora][grupo].materia, aula: state.horarioBase[dia][hora][grupo].aula || '' }
  });
  await queueSave();
  res.json({ message: 'Horario base actualizado', horario: state.horarioBase });
});

app.get('/api/ausencias', ensureAuth, (req, res) => {
  const list = req.user.rol === 'profesor'
    ? state.ausencias.filter(item => item.profesor === req.user.nombre)
    : state.ausencias;
  res.json({ ausencias: [...list].reverse() });
});

app.post('/api/ausencias', ensureAuth, async (req, res) => {
  const profesor = String(req.body.profesor || '').trim();
  const fecha = String(req.body.fecha || '').trim();
  const motivo = String(req.body.motivo || '').trim();

  if (!profesor || !fecha) {
    return res.status(400).json({ message: 'Profesor y fecha son obligatorios' });
  }

  if (req.user.rol === 'profesor' && req.user.nombre !== profesor) {
    return res.status(403).json({ message: 'Solo puedes solicitar tu propia ausencia' });
  }

  const ausencia = {
    id: `aus_${nextId('absence')}`,
    profesor,
    fecha,
    motivo,
    estado: 'pendiente',
    creada: new Date().toISOString().slice(0, 10),
    solicitadoPor: req.user.nombre,
    resultado: null
  };

  state.ausencias.push(ausencia);
  state.auditLog.push({
    id: `audit_${Date.now()}`,
    tipo: 'ausencia_solicitada',
    usuario: req.user.nombre,
    fecha: new Date().toISOString(),
    detalle: ausencia
  });
  await queueSave();
  res.status(201).json({ ausencia });
});

app.patch('/api/ausencias/:id/approve', ensureAuth, async (req, res) => {
  if (!canManageAbsences(req.user.rol)) {
    return res.status(403).json({ message: 'No tienes permisos para aprobar ausencias' });
  }

  const absence = state.ausencias.find(item => item.id === req.params.id);
  if (!absence) {
    return res.status(404).json({ message: 'Ausencia no encontrada' });
  }
  if (absence.estado !== 'pendiente') {
    return res.status(400).json({ message: 'La ausencia ya fue procesada' });
  }

  absence.estado = 'aprobada';
  absence.aprobadaPor = req.user.nombre;
  absence.aprobadaEn = new Date().toISOString();
  absence.resultado = processAbsence(state, absence);
  await queueSave();
  res.json({ ausencia: absence });
});

app.patch('/api/ausencias/:id/reject', ensureAuth, async (req, res) => {
  if (!canManageAbsences(req.user.rol)) {
    return res.status(403).json({ message: 'No tienes permisos para rechazar ausencias' });
  }

  const absence = state.ausencias.find(item => item.id === req.params.id);
  if (!absence) {
    return res.status(404).json({ message: 'Ausencia no encontrada' });
  }
  absence.estado = 'rechazada';
  absence.rechazadaPor = req.user.nombre;
  absence.rechazadaEn = new Date().toISOString();
  await queueSave();
  res.json({ ausencia: absence });
});

app.get('/api/informacion', ensureAuth, (req, res) => {
  if (!canViewInfo(req.user.rol)) {
    return res.status(403).json({ message: 'No tienes permisos para ver esta información' });
  }

  const fecha = String(req.query.fecha || '').trim();
  const info = fecha ? state.informacion.filter(item => item.fecha === fecha) : state.informacion;
  const novedades = fecha ? state.novedades.filter(item => item.fecha === fecha) : state.novedades;
  res.json({ informacion: info, novedades, fecha: fecha || null });
});

app.post('/api/novedades', ensureAuth, async (req, res) => {
  if (!(req.user.rol === 'administrador' || req.user.rol === 'coordinador')) {
    return res.status(403).json({ message: 'No tienes permisos para crear novedades' });
  }

  const fecha = String(req.body.fecha || '').trim();
  const grupo = String(req.body.grupo || '').trim();
  const mensaje = String(req.body.mensaje || '').trim();
  const tipo = String(req.body.tipo || 'aviso').trim();

  if (!fecha || !grupo || !mensaje) {
    return res.status(400).json({ message: 'Fecha, grupo y mensaje son obligatorios' });
  }

  const novedad = {
    id: `nov_${nextId('novedad')}`,
    fecha,
    profesor: req.user.nombre,
    descripcion: mensaje,
    gruposAfectados: [grupo],
    tipo,
    creada: new Date().toISOString()
  };

  state.novedades.push(novedad);
  state.informacion.push({
    id: `info_${nextId('info')}`,
    fecha,
    grupo,
    mensaje,
    tipo,
    creada: new Date().toISOString(),
    profesor: req.user.nombre
  });

  await queueSave();
  res.status(201).json({ novedad });
});

app.get('/api/usuarios', ensureAuth, (req, res) => {
  if (!canManageUsers(req.user.rol)) {
    return res.status(403).json({ message: 'Solo el administrador puede ver usuarios' });
  }
  res.json({ usuarios: state.users.map(publicUser) });
});

app.post('/api/usuarios', ensureAuth, async (req, res) => {
  if (!canManageUsers(req.user.rol)) {
    return res.status(403).json({ message: 'Solo el administrador puede crear usuarios' });
  }

  const input = normalizeUserInput(req.body);
  if (!input.nombre || !input.usuario || !input.contrasena || !input.rol) {
    return res.status(400).json({ message: 'Nombre, usuario, contraseña y rol son obligatorios' });
  }
  if (!ROLE_LABELS[input.rol]) {
    return res.status(400).json({ message: 'Rol inválido' });
  }
  if (state.users.some(item => item.usuario === input.usuario)) {
    return res.status(409).json({ message: 'Ese usuario ya existe' });
  }

  const user = {
    id: nextId('user'),
    nombre: input.nombre,
    usuario: input.usuario,
    contrasena: input.contrasena,
    rol: input.rol,
    email: input.email,
    passwordHash: hashPassword(input.contrasena)
  };

  delete user.contrasena;
  state.users.push(user);
  await queueSave();
  res.status(201).json({ usuario: publicUser(user) });
});

app.put('/api/usuarios/:id', ensureAuth, async (req, res) => {
  if (!canManageUsers(req.user.rol)) {
    return res.status(403).json({ message: 'Solo el administrador puede editar usuarios' });
  }

  const id = Number(req.params.id);
  const user = state.users.find(item => item.id === id);
  if (!user) {
    return res.status(404).json({ message: 'Usuario no encontrado' });
  }

  const input = normalizeUserInput(req.body);
  if (!input.nombre || !input.usuario || !input.contrasena || !input.rol) {
    return res.status(400).json({ message: 'Nombre, usuario, contraseña y rol son obligatorios' });
  }
  if (!ROLE_LABELS[input.rol]) {
    return res.status(400).json({ message: 'Rol inválido' });
  }
  if (state.users.some(item => item.usuario === input.usuario && item.id !== id)) {
    return res.status(409).json({ message: 'Ese usuario ya existe' });
  }

  user.nombre = input.nombre;
  user.usuario = input.usuario;
  user.rol = input.rol;
  user.email = input.email;
  if (input.contrasena) {
    user.passwordHash = hashPassword(input.contrasena);
  }
  await queueSave();
  res.json({ usuario: publicUser(user) });
});

app.delete('/api/usuarios/:id', ensureAuth, async (req, res) => {
  if (!canManageUsers(req.user.rol)) {
    return res.status(403).json({ message: 'Solo el administrador puede eliminar usuarios' });
  }

  const id = Number(req.params.id);
  if (id === req.user.id) {
    return res.status(400).json({ message: 'No puedes eliminar tu propia cuenta' });
  }

  const before = state.users.length;
  state.users = state.users.filter(item => item.id !== id);
  if (state.users.length === before) {
    return res.status(404).json({ message: 'Usuario no encontrado' });
  }

  await queueSave();
  res.json({ message: 'Usuario eliminado' });
});

app.get('/api/me', ensureAuth, (req, res) => {
  res.json({
    user: req.user,
    roles: ROLE_LABELS,
    permissions: {
      canManageUsers: canManageUsers(req.user.rol),
      canManageAbsences: canManageAbsences(req.user.rol),
      canManageBaseSchedule: canManageBaseSchedule(req.user.rol),
      canViewSchedule: canViewSchedule(req.user.rol),
      canViewInfo: canViewInfo(req.user.rol)
    }
  });
});

app.patch('/api/me/password', ensureAuth, async (req, res) => {
  const currentPassword = String(req.body.currentPassword || '').trim();
  const newPassword = String(req.body.newPassword || '').trim();

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'La contraseña actual y la nueva son obligatorias' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ message: 'La nueva contraseña debe tener al menos 6 caracteres' });
  }

  const user = state.users.find(item => item.id === req.user.id);
  if (!user || !verifyPassword(currentPassword, user.passwordHash)) {
    return res.status(401).json({ message: 'La contraseña actual es incorrecta' });
  }

  user.passwordHash = hashPassword(newPassword);
  await queueSave();
  res.json({ message: 'Contraseña actualizada correctamente' });
});

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ message: 'Ruta no encontrada' });
  }
  res.sendFile(path.join(ROOT_DIR, 'index.html'));
});

async function start() {
  state = await ensureState();
  app.listen(PORT, () => {
    console.log(`Plataforma educativa backend running on http://localhost:${PORT}`);
  });
}

start().catch(error => {
  console.error(error);
  process.exit(1);
});