# Manage Sending Limits

## Find Your Current Allowance

Open **Settings > Usage**, or choose **Sending limits** in the header workspace menu. **Transactional** shows live transactional emails for the current project in the UTC calendar month, alongside organization-wide daily and per-minute recipient usage. **Marketing** shows active contacts and broadcasts; **Team** shows resource counts and the API request rate limit.

Daily and per-minute recipient quotas use rolling windows across all projects and streams in the organization. Simulated messages count toward recipient quotas too. There is no separate monthly email quota in this deployment.

Quotas count recipient addresses across API keys and SMTP credentials in the organization. A message sent to several addresses uses several recipients. The limits use rolling windows.

## Change Saved Limits

If your role and deployment allow changes, select **Manage limits** in Transactional. Enter **Recipients per 24 hours** and **Recipients per minute**, then select **Save sending limits**. Values must be positive whole numbers. **Close limits** hides the editor.

Existing usage still counts after a change. Raising a quota does not reset its rolling window. Production quotas may require your platform administrator.

## Unlimited Local Sending

When the deployment makes it available, select **Unlimited sending in local development** and save. Daily and per-minute quotas are bypassed locally. The saved numeric values apply again when unlimited sending is turned off.

Unlimited quotas do not bypass sender verification, request validation or other delivery checks.

## Recover from a Quota Error

Review current limits and recipient usage. Wait for the rolling window to advance or ask an authorized administrator to adjust the configured allowance. Do not treat an accepted API request as a delivery confirmation.
