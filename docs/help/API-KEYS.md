# API Keys

An API key lets your application send email through our API. Treat it like a password.

## Create a Key

1. Go to **API keys** and click **Create API key**.
2. **Name**: what will use the key, e.g. `website-production`.
3. **Permission**:
   - **Sending access**: can only send email. Choose this for almost every application.
   - **Full access**: can also read delivery logs and manage domains, webhooks and suppressions.
4. **Restrict to domain** (optional): the key can only send from that domain.
5. Click **Create key** and **copy the key immediately**. It starts with `mp_`, and we can't show it again.

Only dashboard users (Owner, Admin or Developer roles) can create keys. A key can never create another key.

## Revoke a Key

Click **Revoke** next to the key. Any request using it is rejected straight away. This can't be undone.

Revoke a key immediately if it may have been exposed: committed to a repository, pasted in chat, or used in a website's browser code.

## Changing Keys Without Downtime

1. Create a new key.
2. Update your application to use it.
3. Once **Last used** shows the old key is idle, revoke it.

## Related

- [SMTP credentials](SMTP-CREDENTIALS.md)
- [Developer quickstart](../developer-guides/QUICKSTART.md)
