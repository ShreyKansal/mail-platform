# Attachments

## Sending Attachments with the API

```json
{
  "from": "billing@notify.example.com",
  "to": "ada@example.org",
  "subject": "Invoice 1042",
  "text": "Your invoice is attached.",
  "attachments": [
    {
      "filename": "invoice-1042.pdf",
      "content": "JVBERi0xLjcKJ…",
      "content_type": "application/pdf"
    }
  ]
}
```

```js
import { readFile } from 'node:fs/promises';

const pdf = await readFile('invoice-1042.pdf');
await fetch('http://localhost:3000/v1/emails', {
  method: 'POST',
  headers: { Authorization: `Bearer ${process.env.MP_API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    from: 'billing@notify.example.com',
    to: 'ada@example.org',
    subject: 'Invoice 1042',
    text: 'Your invoice is attached.',
    attachments: [{ filename: 'invoice-1042.pdf', content: pdf.toString('base64'), content_type: 'application/pdf' }],
  }),
});
```

## Rules

| Rule | Limit |
| --- | --- |
| Number of attachments | 20 per email |
| Total size | 10 MB **decoded** across all attachments |
| Request body | 16 MB (`/v1/emails`), 32 MB (`/v1/emails/batch`). Base64 inflates size by about 33%. |
| `filename` | 1–255 characters, no `/`, `\` or control characters |
| `content` | Standard base64 (line breaks allowed), not empty |
| `content_type` | Optional `type/subtype`. Defaults to `application/octet-stream`. |

### Blocked File Types

Attachments with these extensions are refused (`422`, path `attachments[N].filename`), because they are common malware carriers and most mailbox providers reject them anyway:

`exe com bat cmd scr pif vbs vbe js jse wsf wsh msi msp jar ps1 psm1 hta cpl reg lnk dll iso img vhd vhdx`

To share such files, upload them elsewhere and send a link.

## Over SMTP

Attachments in submitted MIME messages are extracted and re-attached under the same rules. Inline (`cid:`) images are currently delivered as ordinary attachments.

## Tips

- Prefer links over large attachments; big messages are more often rejected or filtered.
- Set an accurate `content_type` so clients display the file correctly.
