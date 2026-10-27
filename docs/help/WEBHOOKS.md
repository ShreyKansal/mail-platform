# Set Up Webhooks

A webhook is a web address in your own system that we call whenever something happens to your email: for example, a message is accepted by the recipient's server, bounces, or fails. It lets your application react without polling.

## Add an Endpoint

1. Go to **Webhooks** and select **Add endpoint**.
2. Enter the **Endpoint URL**. It must be a public `https://` address; private and internal network addresses are refused for security.
3. Optionally add a **Description**, such as "Billing service".
4. Under **Events to send**, tick the events you want. Common choices:
   - `email.remote_accepted`: the recipient's server accepted the message.
   - `email.bounced`: the recipient's server refused it.
   - `email.failed`: we stopped trying to deliver it.
5. Select **Add endpoint**.

A dialog shows the endpoint's **signing secret** (`whsec_…`) once. Copy it and give it to your developers. They use it to check that each request really came from us; see [Verify webhook signatures](../developer-guides/WEBHOOK-VERIFICATION.md).

## Available Events

| Event | When it's sent |
| --- | --- |
| `email.accepted` | We accepted the email for sending. |
| `email.scheduled` | The email is scheduled for later. |
| `email.mta_accepted` | Our mail server took the message for delivery. |
| `email.deferred` | The recipient's server asked us to retry later; retries are automatic. |
| `email.remote_accepted` | The recipient's server accepted it (not a guarantee of inbox placement). |
| `email.bounced` | The recipient's server permanently refused it. |
| `email.failed` | Delivery stopped (for example, retries expired). |
| `email.suppressed` | Not sent because the address is suppressed. |
| `email.cancelled` | Cancelled before sending. |
| `email.delivery_unknown` | A connection dropped at a critical moment; it resolves automatically. |
| `domain.verified` / `domain.verification_lost` | A domain started or stopped being able to send. |

The endpoint form may list more events than this table. The list in the form is always the current one.

## See What Was Delivered

Select an endpoint in the list to open **Webhook endpoint**. The **Deliveries** table shows every event sent to it:

- **Succeeded**: your endpoint answered with a 2xx status.
- **Retrying**: your endpoint failed or timed out. We retry after 30 seconds, then 2 minutes, then 10 minutes, and so on, for about 24 hours.
- **Dead**: all retries failed, and we've stopped trying for that event.

The **Last result** column shows the HTTP status or the error, so you can see why an attempt failed.

## Manage an Endpoint

- **Disable** pauses deliveries; **Enable** resumes them. New events aren't queued while the endpoint is disabled.
- **Rotate secret** issues a new signing secret, shown once. For 24 hours, each request is signed with both the new and the old secret, so your system keeps working while your developers switch over.
- **Delete endpoint** removes it after you confirm.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| "webhook URL resolves to a private or reserved address" | The URL points to an internal network. Use a public HTTPS address. |
| Deliveries stay in Retrying | Your endpoint is returning an error or taking longer than 10 seconds. Check **Last result**. |
| Signature verification fails in your code | The wrong secret, or your code changed the request body before checking it. See [Verify webhook signatures](../developer-guides/WEBHOOK-VERIFICATION.md). |
