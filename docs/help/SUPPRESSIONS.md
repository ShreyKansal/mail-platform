# Suppressions

The suppression list holds addresses your organization won't send to. Any email addressed to them is skipped, and the recipient shows as **Suppressed**. The list protects your sender reputation: repeatedly mailing addresses that don't exist makes mailbox providers trust your domain less.

## How Addresses Get on the List

| Reason | How it happens |
| --- | --- |
| **Hard bounce** | Added automatically when a recipient's server says the mailbox or domain doesn't exist (for example "550 5.1.1 user unknown"). |
| **Manual** | Someone in your organization added it on the **Suppressions** page or through the API. |

Not every refusal suppresses an address. Rejections because of policy, content or authentication (for example "550 5.7.1") are problems with the message or your setup, not the address, so the address stays sendable. A full mailbox doesn't suppress it either. See [Email not delivered](EMAIL-NOT-DELIVERED.md).

The list is per organization: an address suppressed in your organization doesn't affect anyone else.

## Find an Address

On **Suppressions**, type the address in **Find address** and select **Search**. If it isn't listed, the address isn't suppressed. **Clear** shows the full list again.

## Add an Address

1. Select **Add address**.
2. Enter the email address in **Suppress an address**.
3. Select **Suppress**.

From then on, emails to that address are skipped. Messages already handed to our mail server aren't recalled.

## Remove an Address

Select **Remove** on the row and confirm. Mail to the address is sent again.

Only remove a **Hard bounce** entry if you know the mailbox now exists, for example because the person fixed a typo or recreated their account. Sending again to a mailbox that really doesn't exist bounces again, and hurts your reputation.

## Related

- [Track delivery](VIEW-DELIVERY-LOGS.md)
- [Email landing in spam](EMAIL-IN-SPAM.md)
