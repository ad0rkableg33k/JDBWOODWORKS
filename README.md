# JDB Woodworks

Website, online store and owner dashboard for JDB Woodworks (jdbwoodworks.com).

Three separate pieces, built to be cheap and simple:

| Piece | What it is | Where it lives |
|---|---|---|
| **Public site** | Home page, gallery, quote form | This repo, served by GitHub Pages |
| **Store** | Items for sale with PayPal Buy Now buttons | This repo (`store.html`, `products.json`) |
| **Owner dashboard** | Orders, stock, expenses, profit. Login required | Google Apps Script + a Google Sheet (code in `apps-script/`) |

Nothing here needs a server we run ourselves.

---

## How it fits together

```
 Customer ──> jdbwoodworks.com (GitHub Pages)
                 ├─ index.html     home + quote request form ──> Google Form ──> Google Sheet of responses
                 ├─ gallery.html   photos
                 └─ store.html     reads products.json ──> PayPal checkout

 Owner ─────> Dashboard (Google Apps Script web app, Workspace login)
                 └─ reads/writes the "JDB Shop Data" Google Sheet
                 └─ "Publish to store" gives text to paste into products.json
```

The public site never talks to the dashboard or the Sheet. The only link between them is
`products.json`, which the owner updates by hand (see below).

---

## The public site

- Plain HTML, CSS and a little JavaScript. No build step. Edit a file, push to `main`, and
  GitHub Pages republishes in a minute or two.
- Domain: `jdbwoodworks.com` (see `CNAME`). The domain is managed through Square, and its DNS
  points at GitHub Pages.
- Files: `index.html`, `gallery.html`, `style.css`, `script.js`, `images/`.
- The holiday trees section on the home page is marked with a comment in `index.html`.
  Delete that section and the `.holiday` rules at the bottom of `style.css` after the season.

### Quote request form

The form on the home page posts to a **Google Form**; answers land in that form's Responses
tab / linked Sheet. The question IDs (`entry.123...`) are in `script.js`.

Things that will silently break it:
- **"Collect email addresses" must stay OFF** in the form's settings.
- The form must be accepting responses and not restricted to signed-in users.
- The dropdown options in the form must match the site's options exactly.
- If the form's questions are rebuilt, the `entry.` IDs change and `script.js` must be updated
  (get them from the form's "Get pre-filled link").

The site always shows "sent" after submitting, even if Google rejected it (the browser can't
see Google's reply). After changing the form, **submit a test and check the Responses tab.**

---

## The store

- `store.html` / `store.js` / `store.css` read `products.json` and show every listed item.
- Each item gets a PayPal Buy Now button. **Checkout is currently off** until a PayPal Client ID
  is pasted into `PAYPAL_CLIENT_ID` at the top of `store.js`. Until then the store shows
  the items and a "call or text to buy" message.
  - Get the ID at developer.paypal.com: Apps & Credentials, Live, create an app, copy the Client ID.
    It is public by design and safe to commit. Never commit a PayPal *secret*.
- Shipping is not charged; buyers pay the item price only.
- **Stock does not update itself.** After a sale, the owner marks it sold in the dashboard and
  re-publishes `products.json`. Until then the store can oversell the last unit.

---

## The dashboard

Lives outside this repo's website on purpose, so there is no customer data or login in the
public site. The code is in `apps-script/`; full setup steps are in
[`apps-script/SETUP.md`](apps-script/SETUP.md).

- **Where the data is:** a Google Sheet named *JDB Shop Data* with tabs Orders, Inventory,
  Expenses and Sales. Don't rename or move the header row on those tabs. The dashboard
  refuses to run rather than guess if the headers change. Google keeps version history
  (File, Version history).
- **Who can get in:** the web app is deployed for "Anyone within jdbwoodworks.com", and only
  the emails listed in the `ALLOWED_EMAILS` script property are let through. If that
  property is empty, nobody gets in. Change it in the Apps Script editor under
  Project Settings, Script properties.
- **The URL** is private. It is not stored in this repo. Bookmark it.
- **Screens:** Overview (revenue, costs, profit, what's owed, what needs attention),
  Orders (customer, contact, request, wood, status, estimate, time, paid, costs, profit),
  Inventory (stock counts, "Sold 1", low-stock warnings, list in store), Expenses (shop
  costs not tied to one order), Backup (restore a backup, order spreadsheet export).
- **Syncing:** it saves to the Sheet on every change (the screen dims for a second), and
  refreshes itself every minute and when you switch back to the tab. Two people editing
  *different* records is fine. If two people edit the *same* record at once, the last save wins.

### How profit is counted

- **Revenue** = money actually received on orders (the "Actual paid" amount, counted on the
  "Paid on" date) + inventory sales logged with "Sold 1".
- **Costs** = each order's materials and other costs + inventory items' cost-to-make when sold
  + shop expenses.
- **Profit** = revenue minus costs. Estimates are not revenue until paid.
- **Still owed** = estimate minus paid, on accepted / in-progress / ready orders.

### Publishing store stock

1. In the dashboard: Inventory, edit an item, set it to **List in store** (needs a price; add a
   description and a photo file name that exists in `images/`).
2. Click **Publish to store** and copy the text it shows.
3. In this repo, replace the contents of `products.json` with it and commit.

### The old browser-only dashboard

`dashboard.html` / `dashboard.js` / `dashboard.css` in the repo root are the original version,
which keeps data only in one browser (localStorage). They're also the source for the Google
version: `apps-script/build.py` bundles them into `apps-script/Index.html`.
**Don't use the public `/dashboard.html` for real data.** It is not password protected and
doesn't sync. The Google Sheet version is the real one.

### Changing the dashboard

1. Edit `dashboard.html`, `dashboard.css` or `dashboard.js` (backend changes go in `apps-script/Code.gs`).
2. Run `python3 apps-script/build.py` to regenerate `apps-script/Index.html`.
3. Paste the changed files into the Apps Script editor, then Deploy, Manage deployments,
   pencil, Version: **New version**, Deploy. The URL stays the same.
4. Commit the changes here.

---

## Day to day (for the owner)

- **New customer request:** add it under Orders as a *Quote*. Update the status as it moves:
  Quote, Accepted, In progress, Ready, Complete.
- **Customer pays:** open the order, fill in **Actual paid** (and materials cost), save.
- **Sold a ready-made item:** Inventory, **Sold 1**. Then re-publish the store file if it's a listed item.
- **Bought tools or supplies:** Expenses, **New expense**.
- **Forms:** check the quote form's Responses tab for new requests.

---

## Known gaps and ideas

- PayPal Client ID not set yet (checkout is off).
- Store stock is updated by hand. A later version could have the store read the Sheet directly
  (needs a small public endpoint) and reduce stock when PayPal confirms a sale.
- No customer email list / newsletter signup yet. Use a proper email service (with
  unsubscribe handling) rather than sending bulk mail from Gmail.
- Cloudflare Access could password-protect the old public `/dashboard.html`, but removing
  it from the public site works too.
