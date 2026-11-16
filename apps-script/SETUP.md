# Shop dashboard on Google Apps Script + Google Sheet

Data lives in a Google Sheet. The dashboard is a web app that only signed-in
jdbwoodworks.com accounts on the allowlist can open. Takes about 10 minutes.

## One-time setup (do this signed in as a Workspace admin)

1. **Make the Sheet.** sheets.new, name it `JDB Shop Data`. If you have a Shared Drive,
   create it there so it isn't tied to one person's account.
2. **Open the script editor.** In the Sheet: Extensions > Apps Script.
3. **Paste the code.**
   - `Code.gs`: replace everything in the default file with `apps-script/Code.gs`.
   - Click **+** > **HTML**, name it exactly `Index`, paste in `apps-script/Index.html`.
   - Project Settings (gear) > tick **Show "appsscript.json" manifest file in editor**,
     go back to Editor, open `appsscript.json`, paste in `apps-script/appsscript.json`.
4. **Set who is allowed.** Project Settings > Script properties > Add script property:
   - Property: `ALLOWED_EMAILS`
   - Value: `stevenb@jdbwoodworks.com,nicole@jdbwoodworks.com`

   If this is empty, nobody can get in (on purpose).
5. **Create the tabs and grant permission.** In the editor pick the function `setup`
   in the dropdown, click **Run**, then Review permissions > Allow.
   The Sheet now has Orders, Inventory, Expenses and Sales tabs.
6. **Deploy.** Deploy > New deployment > type **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone within jdbwoodworks.com**

   Deploy, then copy the web app URL. Bookmark it for both of you.

## Using it

- Open the URL while signed in to your jdbwoodworks.com account. If you are signed in to
  several Google accounts and get "unable to open the file", use a separate Chrome profile
  or an incognito window with only the Workspace account.
- Everything saves to the Sheet, so it matches on every device. The page refreshes
  itself every minute and when you switch back to the tab.
- Do not rename, move or delete the header row on each tab. The dashboard refuses to run
  rather than guess if the headers change. Adding your own tabs or formulas on other
  tabs is fine.
- **Publish to store** (Inventory tab) shows a `products.json` to copy into the repo.

## Website quote requests into Orders

New answers to the website's quote form (the Google Form "orders") appear in the dashboard as
**New request** orders (the Orders tab shows how many), with name, phone, email and request filled in.

1. In the form: Responses tab > **Link to Sheets** > **Select existing spreadsheet** >
   `JDB Shop Data`. A "Form Responses 1" tab appears in the Sheet. Leave it alone.
2. In the script editor, pick `installFormTrigger` and **Run** (Allow the extra permission).
3. Pick `importExistingResponses` and **Run** to bring in anything submitted before step 2.
   Safe to run again: it never duplicates, and never overwrites an order you've edited.

No new deployment is needed for this, since triggers run the saved code.
The form's own email notifications (form Responses tab, three dots, "Get email notifications")
still work and are worth keeping on.

## Moving data from the old browser-only dashboard

On the old page: Backup > Download backup. On the new one: Backup > Restore from backup.

## Changing the code later

Paste the new file contents, then Deploy > Manage deployments > pencil > Version:
**New version** > Deploy. The URL stays the same.
After editing `dashboard.js`, `dashboard.html` or the CSS in the repo, regenerate
`Index.html` with `python3 apps-script/build.py` before pasting.
