# Table treatment from the supplied Administration captures

The two saved Users pages supplied on October 25 show a white table header, a thin rounded outer boundary, horizontal row dividers, aligned actions, and filters outside the table boundary. One capture has the row action menu open; the other has the searchable account-type filter open. These are saved visual references, not evidence of live Atlassian behavior.

The shared dashboard table now follows that container treatment. Removed the negative page margins and edge-to-edge overrides. Table headers are 48px high; body rows have a 56px minimum that can grow with content. Search and toolbars sit above the bounded scrolling table; result counts and pagination sit below. Actions columns default to end alignment unless a caller supplies another alignment. Light headers remain white, and the shared semantic tokens support dark and increased contrast.

The change applies to the shared Table component. It does not implement the reference's searchable checkbox filter menus; that interaction remains a separate follow-up. Empty, loading, errors, cursor pagination and existing resource actions retain their behavior.

Validation: dashboard typecheck, 30 unit tests, production build and design audit passed. Browser fixtures checked nine populated resource pages at desktop and mobile widths in light, dark and increased contrast, in development and production. Checks verified bounded table edges, rounded borders, white light headers and absence of document overflow. Fixture checks do not establish live backend delivery behavior.
