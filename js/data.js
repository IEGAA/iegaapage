// ===================== DATOS INICIALES DEL SISTEMA =====================

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

const HORAS = ['6:00','7:00','8:00','9:00','10:00','11:00','12:00','13:00','14:00','15:00'];
const DIAS = ['Lunes','Martes','Miércoles','Jueves','Viernes'];

const MATERIAS = [
  'Matemáticas','Español','Ciencias Naturales','Historia','Geografía',
  'Educación Física','Inglés','Arte','Ética','Filosofía','Química','Física','Biología'
];

const USUARIOS_INICIALES = [
  { id: 1, usuario: '1034918343', contrasena: 'G1034918343', nombre: 'Administrador', rol: 'administrador', email: 'admin@colegio.edu.co' }
];

// Generar horario base aleatorio pero consistente
function generarHorarioBase() {
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

// ===================== GESTIÓN DE ESTADO =====================

const DB_KEY = 'plataforma_educativa_db';

function getDB() {
  const raw = localStorage.getItem(DB_KEY);
  if (raw) return JSON.parse(raw);
  return initDB();
}

function saveDB(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

function initDB() {
  const horarioBase = generarHorarioBase();
  const db = {
    usuarios: USUARIOS_INICIALES,
    horarioBase: horarioBase,
    horarioNovedades: JSON.parse(JSON.stringify(horarioBase)),
    ausencias: [],
    novedades: [],
    informacion: []
  };
  saveDB(db);
  return db;
}

// Sesión
function getSession() {
  const s = sessionStorage.getItem('session');
  return s ? JSON.parse(s) : null;
}

function setSession(usuario) {
  sessionStorage.setItem('session', JSON.stringify(usuario));
}

function clearSession() {
  sessionStorage.removeItem('session');
}

function requireAuth() {
  const s = getSession();
  if (!s) { window.location.href = 'index.html'; return null; }
  return s;
}
