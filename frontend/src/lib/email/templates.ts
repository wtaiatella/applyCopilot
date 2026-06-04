// Email Templates
// Task T027: Create email service layer
// Contains reusable email templates for notifications

import { EmailTemplate } from './resend';

// Welcome email template for new users
export function getWelcomeEmailTemplate(firstName: string): EmailTemplate {
  return {
    subject: 'Welcome to ApplyCopilot! 🚀',
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to ApplyCopilot</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
    .button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Welcome to ApplyCopilot!</h1>
  </div>
  <div class="content">
    <h2>Hi ${firstName},</h2>
    <p>Welcome to ApplyCopilot - your AI-powered job search companion! We're excited to help you land your dream job.</p>
    
    <h3>Get Started:</h3>
    <ul>
      <li>📄 Upload your CV for AI analysis</li>
      <li>🔍 Search for jobs across multiple portals</li>
      <li>🤖 Get AI-powered cover letters</li>
      <li>📊 Track your applications</li>
    </ul>
    
    <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard" class="button">Go to Dashboard</a>
    
    <p>Need help? Reply to this email or contact our support team.</p>
    
    <div class="footer">
      <p>ApplyCopilot - Making job search smarter</p>
      <p>You received this email because you signed up for ApplyCopilot.</p>
    </div>
  </div>
</body>
</html>
    `,
    text: `Welcome to ApplyCopilot!

Hi ${firstName},

Welcome to ApplyCopilot - your AI-powered job search companion! We're excited to help you land your dream job.

Get Started:
- Upload your CV for AI analysis
- Search for jobs across multiple portals
- Get AI-powered cover letters
- Track your applications

Go to Dashboard: ${process.env.NEXT_PUBLIC_APP_URL}/dashboard

Need help? Reply to this email or contact our support team.

ApplyCopilot - Making job search smarter
`,
  };
}

// Password reset email template
export function getPasswordResetEmailTemplate(resetToken: string, firstName: string): EmailTemplate {
  const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/auth/reset-password?token=${resetToken}`;
  
  return {
    subject: 'Reset your ApplyCopilot password',
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Reset Password</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .container { background: #f9fafb; padding: 30px; border-radius: 8px; }
    .button { display: inline-block; background: #ef4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="container">
    <h2>Hi ${firstName},</h2>
    <p>We received a request to reset your ApplyCopilot password. Click the button below to reset it:</p>
    
    <a href="${resetUrl}" class="button">Reset Password</a>
    
    <p>Or copy and paste this link into your browser:</p>
    <p>${resetUrl}</p>
    
    <p>This link will expire in 1 hour.</p>
    
    <p>If you didn't request this, you can safely ignore this email.</p>
    
    <div class="footer">
      <p>ApplyCopilot Security Team</p>
    </div>
  </div>
</body>
</html>
    `,
    text: `Reset your ApplyCopilot password

Hi ${firstName},

We received a request to reset your ApplyCopilot password. Click the link below to reset it:

${resetUrl}

This link will expire in 1 hour.

If you didn't request this, you can safely ignore this email.

ApplyCopilot Security Team
`,
  };
}

// Job match notification email template
export function getJobMatchEmailTemplate(
  firstName: string,
  jobTitle: string,
  company: string,
  compatibilityScore: number,
  jobId: string
): EmailTemplate {
  const jobUrl = `${process.env.NEXT_PUBLIC_APP_URL}/jobs/${jobId}`;
  
  return {
    subject: `New Job Match: ${jobTitle} at ${company}`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Job Match</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .container { background: #f9fafb; padding: 30px; border-radius: 8px; }
    .score { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px; text-align: center; border-radius: 8px; margin: 20px 0; }
    .score-value { font-size: 36px; font-weight: bold; }
    .button { display: inline-block; background: #22c55e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 5px; }
    .button-secondary { background: #6b7280; }
    .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="container">
    <h2>🎯 New Job Match Found!</h2>
    <p>Hi ${firstName},</p>
    <p>We found a job that matches your profile:</p>
    
    <h3>${jobTitle}</h3>
    <p><strong>Company:</strong> ${company}</p>
    
    <div class="score">
      <div>Compatibility Score</div>
      <div class="score-value">${compatibilityScore}%</div>
    </div>
    
    <a href="${jobUrl}" class="button">View Job Details</a>
    <a href="${jobUrl}/apply" class="button">Apply Now</a>
    
    <div class="footer">
      <p>ApplyCopilot - Your AI Job Search Assistant</p>
      <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/settings/notifications">Manage notification preferences</a></p>
    </div>
  </div>
</body>
</html>
    `,
    text: `New Job Match Found!

Hi ${firstName},

We found a job that matches your profile:

${jobTitle}
Company: ${company}

Compatibility Score: ${compatibilityScore}%

View Job: ${jobUrl}
Apply Now: ${jobUrl}/apply

ApplyCopilot - Your AI Job Search Assistant
`,
  };
}

// Application status update email template
export function getApplicationStatusEmailTemplate(
  firstName: string,
  jobTitle: string,
  company: string,
  newStatus: string,
  applicationId: string
): EmailTemplate {
  const statusEmojis: Record<string, string> = {
    applied: '📤',
    interview: '🗣️',
    offer: '🎉',
    rejected: '❌',
    saved: '💾',
  };
  
  const emoji = statusEmojis[newStatus.toLowerCase()] || '📋';
  
  return {
    subject: `${emoji} Application Update: ${jobTitle}`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Application Update</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .container { background: #f9fafb; padding: 30px; border-radius: 8px; }
    .status { background: #e0e7ff; padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center; }
    .button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; }
    .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="container">
    <h2>Application Status Updated</h2>
    <p>Hi ${firstName},</p>
    <p>Your application for <strong>${jobTitle}</strong> at <strong>${company}</strong> has been updated:</p>
    
    <div class="status">
      <h3>${emoji} ${newStatus}</h3>
    </div>
    
    <a href="${process.env.NEXT_PUBLIC_APP_URL}/applications/${applicationId}" class="button">View Application</a>
    
    <div class="footer">
      <p>ApplyCopilot - Your AI Job Search Assistant</p>
    </div>
  </div>
</body>
</html>
    `,
    text: `Application Status Updated

Hi ${firstName},

Your application for ${jobTitle} at ${company} has been updated:

Status: ${emoji} ${newStatus}

View Application: ${process.env.NEXT_PUBLIC_APP_URL}/applications/${applicationId}

ApplyCopilot - Your AI Job Search Assistant
`,
  };
}

// Password reset email template
export function getPasswordResetTemplate(resetUrl: string): EmailTemplate {
  return {
    subject: 'Reset your ApplyCopilot password',
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
    .button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; margin: 20px 0; }
    .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Password Reset Request</h1>
  </div>
  <div class="content">
    <p>We received a request to reset your ApplyCopilot password.</p>

    <a href="${resetUrl}" class="button">Reset Password</a>

    <div class="warning">
      <strong>Important:</strong> This link expires in 24 hours and can only be used once.
    </div>

    <p>If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.</p>

    <div class="footer">
      <p>ApplyCopilot - Making job search smarter</p>
      <p>This is an automated security email. Please do not reply.</p>
    </div>
  </div>
</body>
</html>
    `,
    text: `Password Reset Request

We received a request to reset your ApplyCopilot password.

Reset your password: ${resetUrl}

Important: This link expires in 24 hours and can only be used once.

If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.

ApplyCopilot - Making job search smarter
This is an automated security email. Please do not reply.
`,
  };
}

// Job match batch template for 3+ jobs (digest)
export interface JobMatchInfo {
  jobId: string;
  jobTitle: string;
  company: string;
  compatibilityScore: number;
}

export function getJobMatchBatchTemplate(
  firstName: string,
  matches: JobMatchInfo[]
): EmailTemplate {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const jobsList = matches
    .map(
      (match) => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
        <strong>${match.jobTitle}</strong><br>
        <span style="color: #6b7280;">${match.company}</span>
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">
        <span style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 4px 12px; border-radius: 12px; font-weight: bold;">
          ${match.compatibilityScore}%
        </span>
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">
        <a href="${baseUrl}/jobs/${match.jobId}" style="color: #667eea; text-decoration: none;">View →</a>
      </td>
    </tr>
  `
    )
    .join('');

  const jobsText = matches
    .map(
      (match) =>
        `- ${match.jobTitle} at ${match.company} (${match.compatibilityScore}% match) - ${baseUrl}/jobs/${match.jobId}`
    )
    .join('\n');

  return {
    subject: `🎯 ${matches.length} New Job Matches Found for You!`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Job Matches Found</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
    .summary { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center; }
    .summary-number { font-size: 48px; font-weight: bold; color: #667eea; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; background: white; border-radius: 8px; overflow: hidden; }
    th { background: #f3f4f6; padding: 12px; text-align: left; font-weight: 600; }
    .button { display: inline-block; background: #22c55e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🎯 Great News!</h1>
    <p>We found ${matches.length} jobs that match your profile</p>
  </div>
  <div class="content">
    <p>Hi ${firstName},</p>
    <p>Our AI analyzed your profile and found these matching opportunities:</p>
    
    <div class="summary">
      <div class="summary-number">${matches.length}</div>
      <div>New Job Matches</div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="text-align: left;">Job</th>
          <th style="text-align: center;">Match Score</th>
          <th style="text-align: center;">Action</th>
        </tr>
      </thead>
      <tbody>
        ${jobsList}
      </tbody>
    </table>

    <a href="${baseUrl}/jobs" class="button">View All Matches</a>
    
    <div class="footer">
      <p>ApplyCopilot - Your AI Job Search Assistant</p>
      <p><a href="${baseUrl}/settings/notifications" style="color: #6b7280;">Manage notification preferences</a></p>
    </div>
  </div>
</body>
</html>
    `,
    text: `🎯 ${matches.length} New Job Matches Found!

Hi ${firstName},

Our AI analyzed your profile and found these matching opportunities:

${jobsText}

View all matches: ${baseUrl}/jobs

ApplyCopilot - Your AI Job Search Assistant
Manage notifications: ${baseUrl}/settings/notifications
`,
  };
}
