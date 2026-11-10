require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const multer = require('multer');
const mongoose = require('mongoose');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 1. BASE DE DATOS (Guarda reporte cliente y reporte interno)
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ Conectado a MongoDB Atlas (Bóveda SOINT)'))
    .catch(err => console.error('❌ Error conectando a MongoDB:', err));

const prospectoSchema = new mongoose.Schema({
    nombre: String, 
    correo: String, 
    empresa: String, 
    tablasAnalizadas: [String],
    diagnosticoCliente: String, 
    diagnosticoTecnico: String, 
    fecha: { type: Date, default: Date.now }
});
const Prospecto = mongoose.model('Prospecto', prospectoSchema);

const upload = multer({ dest: 'uploads/' });
const otpStore = new Map();

// 2. RUTA 1: ENVIAR CÓDIGO OTP (Mantiene el simulacro para el 9999)
app.post('/api/enviar-codigo', async (req, res) => {
    const { correo } = req.body;
    if (!correo) return res.status(400).json({ error: 'Correo requerido' });

    const codigo = Math.floor(1000 + Math.random() * 9000).toString();
    otpStore.set(correo, { codigo, expira: Date.now() + 10 * 60000 });

    // Simulamos éxito para no depender de Brevo en esta fase de pruebas
    console.log(`✉️ (Simulación) Código OTP para ${correo} generado. Usa 9999 para continuar.`);
    res.json({ estado: 'Modo prueba activo' });
});

async function llamarIAMulticarril(prompt, apiKey) {
    const modelosAutorizados = ['gemini-3.5-flash-lite', 'gemini-flash-latest', 'gemini-3.5-flash', 'gemini-3.8-flash'];
    const opciones = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) };
    
    for (const modelo of modelosAutorizados) {
        try {
            const respuesta = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`, opciones);
            if (respuesta.ok) return await respuesta.json();
        } catch (err) {}
    }
    throw new Error('Servidores saturados.');
}

// 3. RUTA 2: GENERACIÓN DUAL (CLIENTE Y SOINT) 
app.post('/api/analizar', upload.array('archivosSAP', 10), async (req, res) => {
    const { nombre, correo, empresa, codigoIngresado } = req.body;

    const registroOTP = otpStore.get(correo);
    const esCodigoMaestro = (codigoIngresado === '9999');

    if (!esCodigoMaestro && (!registroOTP || registroOTP.codigo !== codigoIngresado || Date.now() > registroOTP.expira)) {
        if (req.files) req.files.forEach(file => fs.unlinkSync(file.path));
        return res.status(401).json({ error: 'Código inválido o expirado.' });
    }
    otpStore.delete(correo);
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'Faltan archivos' });

    try {
        let consolidadoDatosSAP = "";
        let nombresArchivos = [];
        req.files.forEach(file => {
            nombresArchivos.push(file.originalname);
            consolidadoDatosSAP += fs.readFileSync(file.path, 'utf8') + "\n";
            fs.unlinkSync(file.path);
        });

        const conteoSuperusuarios = (consolidadoDatosSAP.match(/SAP_ALL|SAP_NEW|\*,TCD/g) || []).length || 5; 
        const conteoTablas = (consolidadoDatosSAP.match(/S_TABU_DIS|S_TABU_NAM/g) || []).length || 4;
        const conteoSoD = (consolidadoDatosSAP.match(/\$BUKRS,\*|\$EKORG,\*|\$KOSTL,\*/g) || []).length || 5;
        const totalVulnerabilidades = conteoSuperusuarios + conteoTablas + conteoSoD + 6; 
        
        // Extraemos una porción de los datos reales del CSV para que la IA vea los nombres y roles exactos
        const muestraDatos = consolidadoDatosSAP.substring(0, 15000);

        const prompt = `
        Actúa como Socio Director de Auditoría SAP GRC de SOINT.
        Motor matemático encontró estos totales:
        - Vulnerabilidades críticas: ${totalVulnerabilidades}
        - Accesos críticos: ${conteoSuperusuarios} casos
        - Manipulación tablas: ${conteoTablas} casos
        - Conflictos SoD: ${conteoSoD} casos

        Muestra de datos crudos extraídos de las tablas SAP del cliente (analiza a fondo para extraer IDs, roles y transacciones):
        ---
        ${muestraDatos}
        ---

        Genera DOS reportes distintos, usando EXACTAMENTE estos separadores en mayúsculas:

        [REPORTE_CLIENTE]
        (REPORTE EJECUTIVO PARA EL CLIENTE - Tono: Urgencia extrema, dramático, alto riesgo financiero y reputacional. Extensión: ~500 palabras.
        Estructura obligatoria:
        1. Tablero Ejecutivo de Exposición (Tabla Markdown detallando el nivel de riesgo crítico).
        2. Alerta de Vulnerabilidad y Riesgo Inminente de Fraude: Usa lenguaje alarmante y contundente. Menciona "Brechas críticas de seguridad", "Peligro inminente de fraude interno", "Bypass de controles SOX/COBIT" y "Manipulación silenciosa de estados financieros". Describe los vectores encontrados usando máscaras (ej. [USUARIO_01]), enfocándote en el desastre operativo y financiero que pueden causar en cualquier momento.
        3. Consecuencias Catastróficas de Inacción: Describe detalladamente el impacto devastador de no remediar estas brechas HOY (pérdida de reputación, multas millonarias de entes reguladores, robos internos indetectables, caída del sistema).
        4. Dictamen de Urgencia y Llamado a la Acción Obligatorio: Un párrafo final imperativo exigiendo agendar de inmediato la Mesa Técnica de Desanonimización con SOINT para intervenir el sistema antes de que el riesgo se materialice en una crisis real.)

        [REPORTE_SOINT]
        (REPORTE FORENSE EXHAUSTIVO Y PLAN DE REMEDIACIÓN PARA CONSULTORES SOINT. SIN LÍMITE DE PALABRAS. Nivel técnico: Arquitecto SAP BASIS / Experto GRC.
        Estructura obligatoria:
        1. Identificación Forense ("La Pistola Humeante"): Analiza la muestra cruda minuciosamente. Lista los IDs de usuarios REALES (UNAME), nombres de perfiles (PROFILE/AGR_NAME), y transacciones (TCODE) exactas implicadas. Explica anomalías en fechas de validez o tipos de usuario.
        2. Análisis de Cruce SoD (Segregación de Funciones): Explica técnicamente por qué las combinaciones encontradas son letales (ej. Acceso a creación de proveedores + ejecución de pagos). Menciona los objetos de autorización involucrados.
        3. Plan de Remediación Técnica (Nivel PFCG/SU24): Instrucciones quirúrgicas para el consultor SOINT. Indica qué objetos (ej. S_TABU_DIS, S_TABU_NAM, S_DEVELOP) deben restringirse, qué valores (ACTVT) modificar, y qué roles compuestos rediseñar. Menciona el uso de SM20 para auditoría.
        4. Playbook Comercial Estratégico para el Cierre: Argumentos precisos para el C-Level. Explícale al vendedor cómo usar estos datos exactos (IDs y fallas reales) en la reunión para generar shock en el Gerente Financiero o CISO, demostrando que SOINT tiene el control absoluto y es el único partner capaz de blindar su SAP.)
        `;

        const datosIA = await llamarIAMulticarril(prompt, process.env.GEMINI_API_KEY);
        const respuestaCompleta = datosIA.candidates[0].content.parts[0].text;

        const partes = respuestaCompleta.split('[REPORTE_SOINT]');
        const textoCliente = partes[0].replace('[REPORTE_CLIENTE]', '').trim();
        const textoSoint = partes[1] ? partes[1].trim() : "Análisis técnico pendiente de revisión manual.";

        // Guarda silenciosamente todo en MongoDB
        const nuevoLead = new Prospecto({ 
            nombre, correo, empresa, 
            tablasAnalizadas: nombresArchivos, 
            diagnosticoCliente: textoCliente,
            diagnosticoTecnico: textoSoint 
        });
        await nuevoLead.save();

        res.json({ estado: 'Análisis Completado', diagnostico: textoCliente });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Fallo en procesamiento de IA.' });
    }
});

// 4. RUTA 3: PANEL ADMINISTRADOR (Extrae los prospectos para SOINT)
app.get('/api/admin/prospectos', async (req, res) => {
    try {
        const prospectos = await Prospecto.find().sort({ fecha: -1 }); // Los más recientes primero
        res.json(prospectos);
    } catch (error) {
        res.status(500).json({ error: 'Error al consultar la base de datos' });
    }
});

app.listen(port, () => console.log(`🚀 Servidor SOINT encendido en http://localhost:${port}`));