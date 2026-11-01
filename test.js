require('dotenv').config();

async function interrogarGoogle() {
    console.log("🔍 Conectando con Google AI Studio...");
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`;
    
    try {
        const respuesta = await fetch(url);
        const datos = await respuesta.json();
        
        if (datos.models) {
            console.log("✅ Google autoriza usar estos modelos:");
            datos.models.forEach(m => console.log(`   👉 ${m.name}`));
        } else {
            console.log("⚠️ Respuesta cruda de Google:", datos);
        }
    } catch (error) {
        console.log("❌ Error de conexión:", error);
    }
}

interrogarGoogle();