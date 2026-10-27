/**
 * In-app guides catalogue. Guide bodies are the Markdown files under /docs
 * (single source of truth for the repository docs and the dashboard).
 * `file` is relative to the repository's docs/ directory.
 */
export interface Guide {
  slug: string;
  title: string;
  summary: string;
  file: string;
  /** Dashboard routes where this guide is offered as contextual help. */
  routes?: string[];
}

export interface GuideCategory {
  id: string;
  title: string;
  description: string;
  guides: Guide[];
}

export const GUIDE_CATEGORIES: GuideCategory[] = [
  {
    "id": "getting-started",
    "title": "Getting Started",
    "description": "Learn the workspace and send your first message.",
    "guides": [
      {
        "slug": "account-setup",
        "title": "Set Up Your Account",
        "summary": "Sign in, manage your account and find workspace settings.",
        "file": "help/ACCOUNT-SETUP.md"
      },
      {
        "slug": "dashboard-overview",
        "title": "Tour of the Dashboard",
        "summary": "Find email activity, content, integrations and workspace settings.",
        "file": "help/DASHBOARD-OVERVIEW.md",
        "routes": [
          "/"
        ]
      },
      {
        "slug": "send-first-email",
        "title": "Send Your First Email",
        "summary": "Verify a sender, submit a test and inspect recipient status.",
        "file": "help/SEND-FIRST-EMAIL.md"
      }
    ]
  },
  {
    "id": "connect",
    "title": "Connect Your Application",
    "description": "Configure domains, credentials and delivery events.",
    "guides": [
      {
        "slug": "quickstart",
        "title": "Developer Quickstart",
        "summary": "Connect your application and submit an email with the REST API.",
        "file": "developer-guides/QUICKSTART.md"
      },
      {
        "slug": "verify-domain",
        "title": "Verify a Domain",
        "summary": "Add a domain, publish its records and enable sending.",
        "file": "help/VERIFY-DOMAIN.md",
        "routes": [
          "/domains"
        ]
      },
      {
        "slug": "dns-setup",
        "title": "DNS Records Explained",
        "summary": "What each record does and common DNS-provider pitfalls.",
        "file": "help/DNS-SETUP.md",
        "routes": [
          "/domains/:id"
        ]
      },
      {
        "slug": "api-keys",
        "title": "API Keys",
        "summary": "Permissions, domain restriction and safe rotation.",
        "file": "help/API-KEYS.md",
        "routes": [
          "/api-keys"
        ]
      },
      {
        "slug": "smtp-credentials",
        "title": "SMTP Credentials",
        "summary": "Usernames, passwords and network restrictions.",
        "file": "help/SMTP-CREDENTIALS.md",
        "routes": [
          "/smtp"
        ]
      },
      {
        "slug": "smtp-integration",
        "title": "Sending with SMTP",
        "summary": "Configure an SMTP client for your deployment.",
        "file": "developer-guides/SMTP-INTEGRATION.md"
      },
      {
        "slug": "webhooks",
        "title": "Set Up Webhooks",
        "summary": "Add an endpoint, choose events, read delivery attempts.",
        "file": "help/WEBHOOKS.md",
        "routes": [
          "/webhooks",
          "/webhooks/:id"
        ]
      },
      {
        "slug": "webhook-verification",
        "title": "Verify Webhook Signatures",
        "summary": "Node.js and Python examples, secret rotation.",
        "file": "developer-guides/WEBHOOK-VERIFICATION.md"
      }
    ]
  },
  {
    "id": "sending",
    "title": "Send and Manage Email",
    "description": "Work with messages, reusable content and recipient data.",
    "guides": [
      {
        "slug": "sending-with-the-api",
        "title": "Sending with the API",
        "summary": "Payloads, idempotency, errors and retries.",
        "file": "developer-guides/SENDING-FIRST-EMAIL.md"
      },
      {
        "slug": "templates",
        "title": "Create and Publish Templates",
        "summary": "Edit a draft, preview variables and publish a reusable version.",
        "file": "help/TEMPLATES.md",
        "routes": [
          "/templates",
          "/templates/:id"
        ]
      },
      {
        "slug": "contacts",
        "title": "Manage Contacts",
        "summary": "Add recipients, import contacts and manage subscription preferences.",
        "file": "help/CONTACTS.md",
        "routes": [
          "/audience"
        ]
      },
      {
        "slug": "broadcasts",
        "title": "Create and Send Broadcasts",
        "summary": "Save email drafts, choose subscribed contacts, test and schedule a broadcast.",
        "file": "help/BROADCASTS.md",
        "routes": ["/broadcasts", "/broadcasts/:id", "/broadcasts/:id/editor"]
      },
      {
        "slug": "automations",
        "title": "Create Email Automations",
        "summary": "Build event-triggered workflows, preview branches and monitor runs.",
        "file": "help/AUTOMATIONS.md",
        "routes": ["/automations", "/automations/:id"]
      },
      {
        "slug": "attachments",
        "title": "Attachments",
        "summary": "Size limits, encoding and blocked file types.",
        "file": "developer-guides/ATTACHMENTS.md"
      },
      {
        "slug": "scheduled-emails",
        "title": "Scheduling and Cancelling",
        "summary": "Send later, and cancel before hand-off.",
        "file": "developer-guides/SCHEDULED-EMAILS.md"
      },
      {
        "slug": "view-delivery-logs",
        "title": "Track Delivery",
        "summary": "Read per-recipient states and the event timeline.",
        "file": "help/VIEW-DELIVERY-LOGS.md",
        "routes": [
          "/emails",
          "/emails/:id"
        ]
      }
    ]
  },
  {
    "id": "troubleshooting",
    "title": "Resolve Delivery Issues",
    "description": "Understand delivery outcomes and recover from failures.",
    "guides": [
      {
        "slug": "email-not-delivered",
        "title": "Email Not Delivered",
        "summary": "Diagnose by recipient state and bounce class.",
        "file": "help/EMAIL-NOT-DELIVERED.md"
      },
      {
        "slug": "email-in-spam",
        "title": "Email Landing in Spam",
        "summary": "What you can control and what no provider can promise.",
        "file": "help/EMAIL-IN-SPAM.md"
      },
      {
        "slug": "suppressions",
        "title": "Suppressions",
        "summary": "Why addresses are suppressed and when to remove them.",
        "file": "help/SUPPRESSIONS.md",
        "routes": [
          "/suppressions"
        ]
      }
    ]
  },
  {
    "id": "workspace",
    "title": "Workspace and Access",
    "description": "Manage sending allowances, permissions and appearance.",
    "guides": [
      {
        "slug": "sending-limits",
        "title": "Manage Sending Limits",
        "summary": "Review quotas and configure local sending allowances.",
        "file": "help/SENDING-LIMITS.md",
        "routes": [
          "/settings"
        ]
      },
      {
        "slug": "team-and-roles",
        "title": "Team Roles and Permissions",
        "summary": "What each role can see and do.",
        "file": "help/TEAM-AND-ROLES.md"
      },
      {
        "slug": "themes-and-accessibility",
        "title": "Themes and Accessibility",
        "summary": "Light, dark and increased-contrast themes; keyboard use.",
        "file": "help/THEMES-AND-ACCESSIBILITY.md"
      },
      {
        "slug": "faq",
        "title": "FAQ",
        "summary": "Answers to common questions.",
        "file": "help/FAQ.md"
      }
    ]
  }
];

export const ALL_GUIDES: Guide[] = GUIDE_CATEGORIES.flatMap(category => category.guides);
export const guideBySlug = (slug: string): Guide | undefined => ALL_GUIDES.find(guide => guide.slug === slug);
export const guideForRoute = (pattern: string): Guide | undefined => ALL_GUIDES.find(guide => guide.routes?.includes(pattern));
