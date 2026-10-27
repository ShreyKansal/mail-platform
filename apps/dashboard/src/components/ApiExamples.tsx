import { useState } from 'react';
import { CodeBlock } from '@atlaskit/code';
import Heading from '@atlaskit/heading';
import Tabs, { Tab, TabList, TabPanel } from './controls/Tabs';
import { Text } from '@atlaskit/primitives';
import { CopyButton } from './dialogs';
import { SideSheet } from './SideSheet';

const languages = ['Node.js', 'Python', 'Go', 'Rust', 'Java', '.NET', 'cURL'] as const;
type Language = typeof languages[number];
const syntax = { 'Node.js': 'javascript', Python: 'python', Go: 'go', Rust: 'rust', Java: 'java', '.NET': 'csharp', cURL: 'bash' } as const;

/** Examples target our REST contract, rather than an unrelated provider's SDK. */
export function emailExample(language: Language, baseUrl: string, batch = false): string {
  const url = `${baseUrl}/v1/emails${batch ? '/batch' : ''}`;
  const email = { from: 'Acme <hello@your-verified-domain.com>', to: ['you@example.com'], subject: 'Hello world', html: '<p>It works!</p>' };
  const body = JSON.stringify(batch ? [email, { ...email, subject: 'Second email' }] : email, null, 2);
  const quoted = JSON.stringify(body);
  switch (language) {
    case 'Node.js': return `import { Morphmailer } from 'morphmailer';\n\nconst apiKey = process.env.MORPHMAILER_API_KEY;\nif (!apiKey) throw new Error('Set MORPHMAILER_API_KEY');\n\nconst mailer = new Morphmailer(\n  apiKey,\n  { baseUrl: ${JSON.stringify(baseUrl)} },\n);\n\nconst { data, error } = await mailer.${batch ? 'batch' : 'emails'}.send(${body});\n\nif (error) {\n  console.error(error.code, error.message);\n} else {\n  console.log(data);\n}`;
    case 'Python': return `# Python 3; standard library\nimport json\nimport urllib.request\n\npayload = ${body}\nrequest = urllib.request.Request(\n    ${JSON.stringify(url)},\n    data=json.dumps(payload).encode(),\n    headers={\n        "Authorization": "Bearer YOUR_API_KEY",\n        "Content-Type": "application/json",\n    },\n    method="POST",\n)\nwith urllib.request.urlopen(request) as response:\n    print(json.load(response))`;
    case 'Go': return `package main\n\nimport (\n  "fmt"\n  "io"\n  "net/http"\n  "strings"\n)\n\nfunc main() {\n  request, err := http.NewRequest("POST", ${JSON.stringify(url)}, strings.NewReader(\`${body}\`))\n  if err != nil { panic(err) }\n  request.Header.Set("Authorization", "Bearer YOUR_API_KEY")\n  request.Header.Set("Content-Type", "application/json")\n  response, err := http.DefaultClient.Do(request)\n  if err != nil { panic(err) }\n  defer response.Body.Close()\n  data, err := io.ReadAll(response.Body)\n  if err != nil { panic(err) }\n  if response.StatusCode >= 400 { panic(string(data)) }\n  fmt.Println(string(data))\n}`;
    case 'Rust': return `// cargo add reqwest --features blocking\nfn main() -> Result<(), Box<dyn std::error::Error>> {\n    let response = reqwest::blocking::Client::new()\n        .post(${JSON.stringify(url)})\n        .bearer_auth("YOUR_API_KEY")\n        .header("Content-Type", "application/json")\n        .body(r#"${body}"#)\n        .send()?\n        .error_for_status()?;\n    println!("{}", response.text()?);\n    Ok(())\n}`;
    case 'Java': return `// Java 17+; standard library\nimport java.net.URI;\nimport java.net.http.*;\n\npublic class Main {\n  public static void main(String[] args) throws Exception {\n    var request = HttpRequest.newBuilder(URI.create(${JSON.stringify(url)}))\n        .header("Authorization", "Bearer YOUR_API_KEY")\n        .header("Content-Type", "application/json")\n        .POST(HttpRequest.BodyPublishers.ofString(${quoted}))\n        .build();\n    var response = HttpClient.newHttpClient().send(\n        request, HttpResponse.BodyHandlers.ofString());\n    if (response.statusCode() >= 400) throw new RuntimeException(response.body());\n    System.out.println(response.body());\n  }\n}`;
    case '.NET': return `// .NET 6+; standard library\nusing System.Net.Http.Headers;\nusing System.Text;\n\nusing var client = new HttpClient();\nclient.DefaultRequestHeaders.Authorization =\n    new AuthenticationHeaderValue("Bearer", "YOUR_API_KEY");\nusing var content = new StringContent(\n    ${quoted}, Encoding.UTF8, "application/json");\nusing var response = await client.PostAsync(${JSON.stringify(url)}, content);\nresponse.EnsureSuccessStatusCode();\nConsole.WriteLine(await response.Content.ReadAsStringAsync());`;
    case 'cURL': return `curl --fail-with-body --request POST '${url}' \\\n  --header 'Authorization: Bearer YOUR_API_KEY' \\\n  --header 'Content-Type: application/json' \\\n  --data '${body}'`;
  }
}

export function ApiExamples({ onClose, returnFocus }: { onClose: () => void; returnFocus?: () => HTMLElement | null }) {
  const [selected, setSelected] = useState(0);
  return <SideSheet title="Sending email API" onClose={onClose} returnFocus={returnFocus}>
    <div className="api-examples">
      <Text as="p">Send with Morphmailer using a verified sender domain and your API key. A successful send accepts the email for processing; track delivery through events.</Text>
      <Tabs id="api-example-language" selected={selected} onChange={setSelected}>
        <TabList>{languages.map(name => <Tab key={name}>{name}</Tab>)}</TabList>
        {languages.map(language => <TabPanel key={language}><div className="api-examples">
      {language === 'Node.js' && <section className="sdk-install" aria-label="Install Morphmailer SDK">
        <div className="api-example-heading"><Heading size="small" as="h3">Morphmailer SDK</Heading><a href="/downloads/morphmailer-0.1.0.tgz" download>Download SDK</a></div>
        <Text as="p" color="color.text.subtle">Node.js 20.8+ · JavaScript & TypeScript. Download the package, then install it in your server project.</Text>
        <div className="sdk-install-code"><code>npm install ./morphmailer-0.1.0.tgz</code><CopyButton value="npm install ./morphmailer-0.1.0.tgz" label="Copy SDK install command" /></div>
        <Text as="p" color="color.text.subtle">Set MORPHMAILER_API_KEY on your server. Keep the API key out of browser code.</Text>
      </section>}
      {language !== 'Node.js' && <Text as="p" color="color.text.subtle">{language === 'cURL' ? 'Direct REST request.' : 'Direct REST example.'} Replace YOUR_API_KEY and the sample addresses before running.</Text>}
      {[false, true].map(batch => {
        const code = emailExample(language, window.location.origin, batch);
        return <section key={String(batch)} className="api-example-section">
          <div className="api-example-heading"><Heading size="small" as="h3">{batch ? 'Send batch emails' : 'Send email'}</Heading><CopyButton value={code} label={batch ? 'Copy batch email example' : 'Copy send email example'} /></div>
          <div className="api-code-scroll" role="region" aria-label={batch ? 'Batch email code' : 'Send email code'} tabIndex={0}><CodeBlock language={syntax[language]} text={code} showLineNumbers={false} /></div>
        </section>;
      })}
        </div></TabPanel>)}
      </Tabs>
      <Text as="p">Batch requests accept 1–100 emails. Quotas count recipients across requests. <a href="/docs" target="_blank" rel="noreferrer">Open full API reference</a></Text>
    </div>
  </SideSheet>;
}
