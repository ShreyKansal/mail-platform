# Create and Publish Templates

## Create a Draft

Open **Templates**, choose **Create template**, enter a name and select **Create draft**. Edit the subject and message content. The **HTML** and **Plain text** tabs edit separate representations of the same draft.

## Define Variables

Expand **Template variables** to edit variable definitions as JSON. Definitions specify a string or number type, whether the value is required and an optional default. Use double braces around a variable name in subject or body text. HTML attribute interpolation is not supported.

## Save and Preview

Select **Save draft** before previewing or publishing. Expand **Preview variables** to supply example values as JSON, then choose **Preview saved draft**. Invalid definitions or values produce an error in the page without discarding your edits.

## Publish a Version

Choose **Publish saved draft** once the draft is saved. Publishing creates a reusable version. **Published versions** lists previous published content. An archived template can be restored; archived content cannot be edited.

## Test and Send

For a published template, provide a verified sender and choose **Simulate published version** to generate test events without sending a real message. Application requests can identify a template and supply variables; pin a version when you need a specific published revision. See [Sending with the API](../developer-guides/SENDING-FIRST-EMAIL.md).
