import nodemailer from "nodemailer"

const port = Number(process.env.SMTP_PORT ?? 587)

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port,
  secure: port === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

export async function sendOTPEmail(email: string, code: string) {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM ?? "noreply@jev.app",
    to: email,
    subject: `Your login code: ${code}`,
    text: `Your one-time login code is: ${code}\n\nThis code expires in 10 minutes.`,
    html: `
      <div style="font-family: monospace; max-width: 400px; margin: 0 auto; padding: 24px;">
        <h2 style="margin-bottom: 16px;">Your login code</h2>
        <p style="font-size: 32px; letter-spacing: 8px; font-weight: bold; text-align: center; padding: 16px; background: #f4f4f5; border-radius: 8px;">${code}</p>
        <p style="color: #71717a; font-size: 14px; margin-top: 16px;">This code expires in 10 minutes.</p>
      </div>
    `,
  })
}

export async function sendVerificationEmail(email: string, code: string) {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM ?? "noreply@jev.app",
    to: email,
    subject: `Verify your email: ${code}`,
    text: `Your verification code is: ${code}\n\nThis code expires in 10 minutes.`,
    html: `
      <div style="font-family: monospace; max-width: 400px; margin: 0 auto; padding: 24px;">
        <h2 style="margin-bottom: 16px;">Verify your email</h2>
        <p style="font-size: 32px; letter-spacing: 8px; font-weight: bold; text-align: center; padding: 16px; background: #f4f4f5; border-radius: 8px;">${code}</p>
        <p style="color: #71717a; font-size: 14px; margin-top: 16px;">This code expires in 10 minutes.</p>
      </div>
    `,
  })
}
