require('dotenv').config();
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

async function main() {
  console.log("Testing Resend API with FROM_EMAIL:", process.env.FROM_EMAIL);
  try {
    const { data, error } = await resend.emails.send({
      from: process.env.FROM_EMAIL || 'onboarding@resend.dev',
      to: 'wtaiatella@gmail.com',
      subject: 'Test Email',
      html: '<p>This is a test</p>',
    });

    if (error) {
      console.error('Error from Resend:', error);
    } else {
      console.log('Success:', data);
    }
  } catch (err) {
    console.error('Exception:', err.message);
  }
}
main();
