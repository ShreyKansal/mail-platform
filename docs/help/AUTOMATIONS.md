# Create Email Automations

Open [Automations](/automations) and choose **Create automation**. Give it a name, choose **Start with a trigger**, then enter the event that starts it, such as `contact.signed_up`. Define any required event properties and their types.

## Build the Workflow

The workflow canvas shows your trigger, steps and their connections. Enter the trigger event directly in its card. Select a node to edit it in the inspector. Use the plus control at the end of a branch to add a step. The control connects the new step to that branch automatically.

Scroll inside the canvas to explore a large workflow. Zoom controls change the graph scale; **Fit width** fits the graph horizontally. Zoom stops at 40%; exceptionally wide workflows retain local scrolling. Nodes and add controls also work with the keyboard. On narrow screens, the inspector fills the editing area; **Close settings** returns to the selected node.

- **Send email:** Use a verified sender and add a subject and HTML or plain text. You can copy a published template and map its variables to contact fields or event properties. Later template changes do not affect this copy.
- **Wait:** Pause the run for a duration of up to 30 days.
- **Condition:** Compare event properties or contact fields. Match all conditions (AND) or any condition (OR), then choose separate destinations for matching and non-matching contacts.
- **Wait for event:** Wait for another event for the same contact, or take the timeout path when the deadline passes.

Select **Trigger** to choose the first step. Select another node to change its next destination. Add destination steps before selecting them. A destination of **Finish run** ends that branch. The editor offers later steps so new connections cannot create loops. Publishing also validates the entire graph and rejects unreachable steps.

Personalize emails with `{{contact.first_name}}`, `{{contact.last_name}}`, `{{contact.email}}`, or `{{event.property}}`. HTML values are escaped. Unsubscribed and suppressed contacts do not receive automation emails.

## Preview and Publish

Save the draft and choose **Test workflow** from **Automation options** in the header. Select a test contact, provide JSON event properties and choose **Preview path**. This does not send emails; it reports the selected steps and stops at a wait-for-event step.

Choose **Publish** to activate the saved version. Saved edits do not change the currently published version until published again. Existing runs continue with their original version.

Choose **API** from **Automation options**, or use the code control on the trigger card, for an event request example. Use a contact from this workspace and an API key with `automations:send`. Use a unique idempotency key for each event, retaining the same key when retrying the same request. A matching event can start multiple active automations.

## Monitor Runs

Open **Activity** in the editor rail, then **Runs**, and filter by status. **Details** shows the contact, version, steps and links to queued emails. A completed email step means the email was queued; it does not confirm inbox delivery.

You can also choose **View activity** from the automation list. The selected Workflow, Runs or Metrics view and Metrics date range stay in the URL, so reload and browser Back keep your place.

**Metrics** shows run status shares, daily run and email counts, and node executions for the latest published version. Choose a 7, 14 or 30 day range. The period uses UTC and includes runs started in that period; their statuses reflect the current state. The graph uses the immutable published workflow, so unpublished draft edits do not change its node labels. Server acceptance records receiving-server acceptance and does not confirm inbox placement.

Choose **Settings** from **Automation options** to pause, resume, duplicate or delete a draft. **Pause** stops new enrollments and processing of further steps, and holds queued automation emails. **Resume** continues processing and releases held emails. Emails already handed to the mail server cannot be recalled. You can retry a failed run or cancel its remaining steps and queued emails. Retrying does not requeue email steps that already completed.

Reading automations requires `automations:read`. Editing requires `automations:manage`. Publishing, pausing, resuming, testing, submitting events and controlling runs require `automations:send`.
