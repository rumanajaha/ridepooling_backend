import axios from 'axios';
import logger from '../utils/logger.js';

const toE164Like = (phone) => {
  if (!phone) return null;
  const cleaned = String(phone).trim().replace(/[^\d+]/g, '');
  if (!cleaned) return null;

  if (cleaned.startsWith('+')) return cleaned;

  // Default to India country code if not provided.
  if (cleaned.length === 10) return `+91${cleaned}`;

  return `+${cleaned}`;
};

const collectSmsRecipients = ({ sosAlert, adminUsers = [] }) => {
  const trustedPhones = (sosAlert?.trustedContacts || [])
    .map((contact) => toE164Like(contact?.phone))
    .filter(Boolean);

  const adminPhones = adminUsers.map((admin) => toE164Like(admin?.phone)).filter(Boolean);

  const configuredPhones = (process.env.EMERGENCY_SMS_TO || '')
    .split(',')
    .map((phone) => toE164Like(phone))
    .filter(Boolean);

  return [...new Set([...trustedPhones, ...adminPhones, ...configuredPhones])];
};

const sendTwilioSmsAlerts = async ({ sosAlert, recipients }) => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    return { sent: 0, skipped: recipients.length, reason: 'twilio-not-configured' };
  }

  let sent = 0;

  const alertMessage = [
    `SOS ALERT: ${sosAlert?.userName || 'A user'} triggered emergency assistance.`,
    `Ride: ${sosAlert?.rideId || 'unknown'}`,
    `Location: ${JSON.stringify(sosAlert?.location || {})}`,
    `Time: ${new Date(sosAlert?.timestamp || Date.now()).toISOString()}`,
  ].join(' ');

  for (const to of recipients) {
    try {
      const form = new URLSearchParams();
      form.append('To', to);
      form.append('From', fromNumber);
      form.append('Body', alertMessage);

      await axios.post(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        form.toString(),
        {
          auth: {
            username: accountSid,
            password: authToken,
          },
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 8000,
        }
      );

      sent += 1;
    } catch (error) {
      logger.error('Twilio emergency SMS send failed', {
        error: error.message,
        rideId: sosAlert?.rideId,
        recipient: to,
      });
    }
  }

  return { sent, skipped: recipients.length - sent };
};

export const notifyEmergencyChannels = async ({ sosAlert, adminUsers = [] }) => {
  const webhookUrl = process.env.EMERGENCY_WEBHOOK_URL;
  const notifications = [];

  if (webhookUrl) {
    try {
      await axios.post(
        webhookUrl,
        {
          type: 'SOS_EMERGENCY',
          payload: sosAlert,
          admins: adminUsers.map((a) => ({
            id: a._id?.toString(),
            email: a.email,
            name: a.name,
            phone: a.phone || null,
          })),
        },
        { timeout: 8000 }
      );

      notifications.push('webhook');
    } catch (error) {
      logger.error('Emergency webhook notification failed', {
        error: error.message,
        rideId: sosAlert?.rideId,
      });
    }
  }

  const recipients = collectSmsRecipients({ sosAlert, adminUsers });
  if (recipients.length > 0) {
    const smsResult = await sendTwilioSmsAlerts({ sosAlert, recipients });
    if (smsResult.sent > 0) {
      notifications.push('twilio-sms');
    }
  }

  if (!process.env.EMERGENCY_WEBHOOK_URL && recipients.length === 0) {
    logger.warn('No emergency channels configured (webhook/sms); external emergency notifications are disabled');
  }

  return {
    deliveredChannels: notifications,
  };
};

export default notifyEmergencyChannels;
