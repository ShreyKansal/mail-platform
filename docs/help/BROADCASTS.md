# Create and Send Broadcasts

## Create a Draft

Open **Broadcasts**, choose **Create broadcast**, enter a name and select **Create draft**. Drafts can be saved before the email is complete. Use the list search and status filter to find existing broadcasts. The row actions menu offers duplication and draft deletion. Selecting draft checkboxes lets you delete those drafts together.

## Write the Email

Enter a name, verified **From** address, optional **Reply-to** address and subject. The **HTML** and **Plain text** tabs edit separate versions of the message. The preview renders HTML in an isolated frame; scripts and remote assets are blocked. It is a preview, not a guarantee of rendering in every email client.

Choose **Save draft** before testing or sending. Errors keep your entered content in the editor. If another person changes the saved revision, **Reload saved version** lets you replace your edits after a confirmation. Copy any content you want to retain before discarding changes.

## Choose Recipients

Choose **All subscribed contacts** or **Selected contacts**. The selected-contacts picker supports search and paging; selections are retained when moving between pages. Unsubscribed, archived and suppressed contacts are excluded when sending. The eligible and excluded counts refer to the saved draft. Eligibility is checked again during processing.

## Test the Saved Content

Choose **Send test email**, enter one recipient and confirm. This sends a real email to that address. It does not send the broadcast to the full audience. A successful submission means the test was accepted for processing, not confirmed in the inbox.

## Send Now or Schedule

Choose **Review and send** after saving complete content and checking the eligible audience. Review the sender, subject and recipient count. Leave the schedule blank to **Send now**, or choose a future date and time within 30 days to **Schedule broadcast**. The date field uses your local time.

Sending requires broadcast sending permission. The API also validates the sender, content and recipients. Broadcast emails include an unsubscribe link; unsubscribed recipients are excluded from later broadcasts.

## Follow Progress

The activity panel shows processed, queued, skipped and failed counts. **Processed** includes queued, skipped and failed recipients. **Completed** means the broadcast finished processing its recipients; it does not mean every email reached an inbox. Use email activity to inspect delivery states.

**Cancel broadcast** stops remaining work and eligible queued messages. It cannot recall emails already dispatched. **Retry remaining recipients** resumes an interrupted failed broadcast without intentionally resending already processed recipients.

## Use the API

The **API** button on the Broadcasts list opens create, save and send examples. Replace the example API key, broadcast ID and revision values with your own values. Use the revision returned by the previous response for the next write. The final send request sends real email; review your content and audience first.
