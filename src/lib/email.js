import emailjs from '@emailjs/browser'

const SERVICE_ID = 'service_oa63ggp'
const TEMPLATE_ID = 'template_uj4ylsf'
const PUBLIC_KEY = '2N9uGy2kH6-dCAWF5'

export async function sendEmail(to_email, subject, message) {
  try {
    await emailjs.send(SERVICE_ID, TEMPLATE_ID, {
      to_email,
      subject,
      message
    }, PUBLIC_KEY)
    return true
  } catch (error) {
    console.error('Erreur email:', error)
    return false
  }
}

export async function sendEmailsToAll(emails, subject, message) {
  const results = await Promise.all(
    emails.filter(Boolean).map(email => sendEmail(email, subject, message))
  )
  return results.filter(Boolean).length
}