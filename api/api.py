from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from dotenv import load_dotenv
import google.generativeai as genai
import os

load_dotenv()

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
model = genai.GenerativeModel("gemini-flash-latest")

app = FastAPI()

# Agregar CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class BotRequest(BaseModel):
    text: str
    user: str

class BotResponse(BaseModel):
    reply: str
    typing_delay: Optional[float] = None


@app.post("/bot", response_model=BotResponse)
def bot(req: BotRequest):
    prompt = f"""
Eres un bot de chat amable, natural y breve. Te llamas Aideijo. Respondes a los mensajes de los usuarios de forma clara, concisa y amigable. No uses frases genéricas como "Como modelo de lenguaje...". En su lugar, responde directamente a lo que el usuario pregunta o comenta. Comportate de manera un poco aristocratica pero no demasiado. Estes preparado a que te van a preguntar sobre libros y autores, y que te van a pedir recomendaciones de lectura. Si no sabes la respuesta a algo, admítelo de forma educada. No inventes información.
Usuario: {req.user}
Mensaje: {req.text}
Responde como una persona real.
"""

    result = model.generate_content(prompt)

    return {
        "reply": result.text.strip(),
        "typing_delay": min(1.0, max(0.2, len(req.text) * 0.02))
    }
