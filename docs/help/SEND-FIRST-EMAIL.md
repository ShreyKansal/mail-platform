# Send Your First Email

## Prepare Your Sender

[Verify a domain](VERIFY-DOMAIN.md) before sending. Use an address at that domain as the sender. The address does not need to be a mailbox, but replies require a working mailbox or routing configuration.

## Send from the Dashboard

1. Open **Emails** and select **Send test email**.
2. Leave **Delivery mode** on **Live (sends real email)** to send to an address you own.
3. Enter the sender, recipient, subject and message.
4. Select **Send real email**.

The email detail page opens after the request is accepted. Inspect each recipient's status and timeline. **Accepted by recipient server** confirms server acceptance, not inbox placement.

## Simulate a Delivery Outcome

Choose a simulation in **Delivery mode** to exercise success, deferral, bounce or suppression events. A simulation does not send a real message. Select **Run simulation** and inspect the resulting detail page.

## Send from Your Application

Create an [API key](API-KEYS.md) and follow the [Developer quickstart](../developer-guides/QUICKSTART.md), or configure [SMTP credentials](SMTP-CREDENTIALS.md). The header help menu also offers **Open API examples** with a downloadable Morphmailer SDK and language examples.

## Review Sending Limits

Open **Settings > Sending limits**. Authorized users can edit limits where the deployment permits it; local development can also allow unlimited sending. See [Manage sending limits](SENDING-LIMITS.md).

## Resolve a Missing Message

Check [Email not delivered](EMAIL-NOT-DELIVERED.md) first. If the receiving server accepted the message, review [Email landing in spam](EMAIL-IN-SPAM.md).
