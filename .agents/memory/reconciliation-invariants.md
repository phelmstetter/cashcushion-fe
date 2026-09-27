---
name: Server-owned reconciliation invariants
description: Why matched forecast account changes and deletion must not bypass the server's transaction claim.
---

When reconciliation is server-owned, a browser must not move a matched forecast
to another account or delete it without a server operation that updates the
transaction claim and learning state. Normal edits to its amount, date, name,
or recurrence can remain permitted.

**Why:** Protecting only explicit match/provenance fields in Firestore rules
still lets an account change invalidate the account relationship or a deletion
orphan the server's claim. The manual reconciliation API provides match,
replacement, and unmatch, but not a matched-forecast delete or account-move
transaction.

**How to apply:** Keep client-side matched account moves and deletes blocked
until an appropriate backend operation exists. If that operation is added,
update frontend behavior and rules together; never emulate claim release
through direct browser writes.