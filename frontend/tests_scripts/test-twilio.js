require('dotenv').config();
const twilio = require('twilio');

// Configuração lida do .env
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER;

// ALERTA: Coloque o seu número de WhatsApp pessoal aqui no formato +55DDNNNNNNNNN
// Lembre-se: no Twilio Sandbox, você precisa ter enviado a mensagem "join <palavra-chave>"
// para o número do Sandbox antes de conseguir receber mensagens!
const TO_NUMBER = '+5541992292443';

async function testTwilio() {
  if (!accountSid || accountSid === 'AC_xxx') {
    console.error("❌ ERRO: TWILIO_ACCOUNT_SID não parece estar configurado no .env");
    return;
  }

  if (TO_NUMBER === 'COLOQUE_SEU_NUMERO_AQUI') {
    console.error("❌ ERRO: Por favor, edite o arquivo test-twilio.js e insira seu número de WhatsApp.");
    return;
  }

  console.log(`Testando envio via Twilio Sandbox...`);
  console.log(`De: whatsapp:${fromNumber}`);
  console.log(`Para: whatsapp:${TO_NUMBER}`);

  const client = twilio(accountSid, authToken);

  try {
    const message = await client.messages.create({
      from: `whatsapp:${fromNumber}`,
      to: `whatsapp:${TO_NUMBER}`,
      body: '🚀 *Teste do ApplyCopilot* 🚀\n\nSe você está recebendo esta mensagem, a integração com o Twilio WhatsApp Sandbox está funcionando perfeitamente!',
    });

    console.log('✅ Sucesso! Mensagem enviada.');
    console.log('ID da Mensagem (SID):', message.sid);
  } catch (error) {
    console.error('❌ Falha ao enviar mensagem:');
    console.error(error.message);
  }
}

testTwilio();
