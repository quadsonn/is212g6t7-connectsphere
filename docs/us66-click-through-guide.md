# Story 66 click-through test guide

Story: **#66 Assigned Tech Support receive equipment notifications** (backlog numbers from [BACKLOG.md](BACKLOG.md)).
Branch `sprint4-pamika`, local database only. Every password is `12345678`.

**The ACs**
- **[AC-1]** Event with live reservations cancelled or rejected → the assigned Tech Support member is notified (mirrors #40's venue **Event cancelled** notice).
- **[AC-2]** Approved change request rebooks reservations to a new time → the assigned Tech Support member is notified (mirrors #40's **Approved booking changed** notice).
- **[AC-3]** Equipment request submitted before anyone is assigned → goes to the whole Tech Support pool. After assignment → the assignee only.
- **✗** marks a negative check: something must **not** happen.

Times on screen are **Singapore time (SGT)**, except inside the **Equipment rebooked** message, which the server writes in UTC (see [Caveats](#caveats)).

---

## Before you start

### Reset (once, before step 1)

```bash
npm run prisma:seed:us61
npm run prisma:seed:us66
npm run dev                        # API and web together
```

Both seeds delete their previous run first, so you can re-run them to start over. They refuse to run unless `DATABASE_URL` is localhost.

**First time on this database?** Run these first. ⚠️ `dropdb` wipes `connectsphere_dev`.
```bash
dropdb connectsphere_dev && createdb connectsphere_dev   # stop `npm run dev` first
npx prisma migrate deploy
npm run prisma:seed
npm run prisma:seed:roles
```

### Accounts

| Account | Who | Part in this story |
|---|---|---|
| `organiser@connectsphere.local` | Priya, Organiser | Cancels events, requests changes |
| `coordinator@connectsphere.local` | Marcus, Coordinator | Rejects, approves, records requirements, assigns |
| `tech@connectsphere.local` | **Wei**, Tech Support | **The assignee** |
| `tech2@connectsphere.local` | **Nadia**, Tech Support | **Not assigned**: must hear nothing except the AC-3 pool notice |

### Seeded events

The dates assume you seeded on **23 Oct 2026**. They move with the day you seed.

| Event | Status | When (SGT) | Tech Support | Equipment |
|---|---|---|---|---|
| [US-66] Gala Dinner | Planning | 12 Nov, 18:00–22:00 | Wei | 2 × [US-66] Projector reserved |
| [US-66] Supplier Summit | Planning | 14 Nov, 09:00–12:00 | Wei | 1 × [US-66] Projector reserved |
| [US-66] Annual Conference | Confirmed | 17 Nov, 09:00–17:00 | Wei | 3 × [US-66] Projector reserved, and a pending change request to 18 Nov |
| [US-66] Hackathon | Planning | 20 Nov, 10:00–18:00 | nobody | nothing, no support needs |
| [US-61] Workshop A | Planning | 6 Nov, 10:00–12:00 | Wei | **nothing reserved** |

### Tips

- **Bell:** refreshes about every 30 s, or straight away on reload. Clicking a notice opens its page and marks it read. **View all** opens `/notifications`.
- **Every story-66 notice** shows a bold **title**, the **message**, then a grey line `<event name> · <time>`. For Tech Support, clicking it opens **`/equipment/requirements/<event id>`**, the event's requirements page, titled with the event name.
- **Switching users:** log out and back in, or keep `tech@` and `tech2@` in separate browsers (e.g. Chrome and Safari) so you can watch both bells.

---

## The flow

### Part 1: equipment request before and after assignment [AC-3]

**Log in as coordinator@**

1. **Review queue** → **[US-66] Hackathon** → **View details**.
   - There's **no Technical support staff** card yet, because the event has no support needs.
2. In **Equipment and technical requirements**, click **Edit requirements**.
3. Click **Add item** → in the dropdown choose **[US-66] Projector — AV store** → quantity `2`.
4. **Technical support needed** → type `AV technician for the demo stage.`
5. Click **Save requirements**.
   - "Requirements saved. Technical Support can now see them on this event."
   - The **Technical support staff** card appears: "No one is assigned yet."

**Log in as tech@** **[AC-3]**

6. Bell → **Equipment request**
   - "Equipment: 2 × [US-66] Projector. Technical support: AV technician for the demo stage."
   - `[US-66] Hackathon · <time>`
7. Click it → `/equipment/requirements/<id>`, "[US-66] Hackathon", listing 2 × [US-66] Projector and the support needs.

**Log in as tech2@** **[AC-3]**

8. Bell → **the same Equipment request notice**. Nobody is assigned, so the whole pool (Wei and Nadia) got it.

**Log in as coordinator@**

9. Back on **[US-66] Hackathon** → **Technical support staff** → **Assign** on **Wei Technical**.
   - "Assigned: Wei Technical". Assigning sends no notice.
10. **Edit requirements** → change the quantity to `3` → **Save requirements**.
11. **Edit requirements** → change nothing → **Save requirements**. **[AC-3 ✗]**
    - "Nothing changed, so nothing was saved." Nothing is sent for this save.

**Log in as tech@** **[AC-3]**

12. Bell → **a second Equipment request**: "Equipment: 3 × [US-66] Projector. Technical support: AV technician for the demo stage." Only one new notice: step 11 sent nothing.

**Log in as tech2@** **[AC-3 ✗]**

13. Bell → **nothing new**, still only the step 8 notice. Wei is assigned now, so only he hears.

---

### Part 2: change request rebooks the equipment [AC-2]

**Log in as organiser@**

14. **My requests** → **[US-66] Gala Dinner** → **Request a change**.
15. **Start date** 13 Nov 2026, **Start time** 18:00, **End date** 13 Nov 2026, **End time** 22:00 (one day later). Leave the rest as it is.
16. **Reason for the change** → `Speaker moved to Friday` → **Submit change request**.
    - "Pending change request" shows on the page.

**Log in as coordinator@**

17. **Change requests** → **[US-66] Gala Dinner** → **Review**.
    - **Arrangement check**: nothing conflicts, and 2 × [US-66] Projector will move to the new time.
18. Click **Approve**.
    - "Approved. … 1 equipment reservation rebooked for the new time."

**Log in as tech@** **[AC-2]**

19. Bell → **Equipment rebooked**
    - "Time 12 Nov, 10:00–14:00 UTC → 13 Nov, 10:00–14:00 UTC. Rebooked: 2 × [US-66] Projector. The reservations carry over; nothing needs committing again."
    - `[US-66] Gala Dinner · <time>`
20. Click it → `/equipment/requirements/<id>`. The event now shows 13 Nov, 18:00–22:00.
21. Sidebar **Released reservations** → 2 × [US-66] Projector, **Event moved — rebooked for the new time**. That's the old reservation, kept as a record.

**Log in as organiser@** (#37's notice, not story 66)

22. Bell → "Your change request for "[US-66] Gala Dinner" was approved; the event has been updated."

---

### Part 3: cancel by the Organiser [AC-1]

**Still organiser@**

23. **My requests** → **[US-66] Gala Dinner** → **Cancel event**.
24. **Reason for cancelling** → `Venue flooded` → **Confirm cancellation**.
    - "This event has been cancelled. Its venue bookings and equipment have been released…"

**Log in as tech@** **[AC-1]**

25. Bell → **Equipment released**
    - "Event cancelled. Released: 2 × [US-66] Projector."
    - `[US-66] Gala Dinner · <time>`
26. Click it → `/equipment/requirements/<id>`, with status **Cancelled**.

**Log in as coordinator@** (#43's notice, not story 66)

27. Bell → "[US-66] Gala Dinner has been cancelled." **Reason:** Venue flooded.

---

### Part 4: reject unfulfillable by the Coordinator [AC-1]

**Still coordinator@**

28. **Review queue** → **[US-66] Supplier Summit** → **View details**.
29. Scroll to **Can't be fulfilled?** → **Reject request**.
30. Choose **No available equipment** → **Comment** `Projectors booked out` → **Confirm rejection**.
    - Status **Rejected**, and the panel disappears.

**Log in as tech@** **[AC-1]**

31. Bell → **Equipment released**
    - "Event rejected as unfulfillable. Released: 1 × [US-66] Projector."
    - `[US-66] Supplier Summit · <time>`
32. Click it → `/equipment/requirements/<id>`, with status **Rejected**.

**Log in as organiser@** (#47's notice, not story 66)

33. Bell → "Your event request "[US-66] Supplier Summit" has been rejected because it cannot be fulfilled." **Reason:** No available equipment: Projectors booked out.

---

### Part 5: no live reservations → no notice [AC-2 ✗, AC-1 ✗]

[US-61] Workshop A has Wei assigned but **nothing reserved**.

**Still organiser@**

34. **My requests** → **[US-61] Workshop A** → **Request a change** → move it **one day later**, same times → reason `Room swap` → **Submit change request**.

**Log in as coordinator@**

35. **Change requests** → **[US-61] Workshop A** → **Review** → **Approve**. It's approved, with nothing rebooked.

**Log in as organiser@**

36. **My requests** → **[US-61] Workshop A** → **Cancel event** → reason `No longer needed` → **Confirm cancellation**.

**Log in as tech@** **[AC-2 ✗] [AC-1 ✗]**

37. Bell → **no** Equipment rebooked and **no** Equipment released for **[US-61] Workshop A**.

---

### Part 6: nobody assigned → no notice [AC-2 ✗, AC-1 ✗]

**Log in as coordinator@**

38. **Review queue** → **[US-66] Annual Conference** → **View details** → **Technical support staff** → **Remove**.
    - The card reads "No one is assigned yet."
39. **Change requests** → **[US-66] Annual Conference** (the seeded request, moving it to 18 Nov) → **Review** → **Approve**.
    - "Approved. … 1 equipment reservation rebooked for the new time."

**Log in as organiser@**

40. **My requests** → **[US-66] Annual Conference** → **Cancel event** → reason `Budget cut` → **Confirm cancellation**.

**Log in as tech@** **[AC-2 ✗] [AC-1 ✗]**

41. Bell → **no** Equipment rebooked and **no** Equipment released for **[US-66] Annual Conference**.
42. **Released reservations** → 3 × [US-66] Projector appears twice: once **Event moved — rebooked for the new time**, once **Event cancelled**. So the rebook and the release did happen; nobody was told, because nobody was assigned.

---

### Final check: the bells

**tech@** (Wei): open the bell → **View all**. Exactly **five** story-66 notices:

| # | Title | Event | AC | From step |
|---|---|---|---|---|
| 1 | Equipment request (2 × [US-66] Projector) | [US-66] Hackathon | AC-3 (pool) | 5 |
| 2 | Equipment request (3 × [US-66] Projector) | [US-66] Hackathon | AC-3 (assignee) | 10 |
| 3 | Equipment rebooked | [US-66] Gala Dinner | AC-2 | 18 |
| 4 | Equipment released, cancelled | [US-66] Gala Dinner | AC-1 | 24 |
| 5 | Equipment released, rejected | [US-66] Supplier Summit | AC-1 | 30 |

Nothing for [US-61] Workshop A or [US-66] Annual Conference.

**tech2@** (Nadia) **[AC-1 ✗] [AC-2 ✗] [AC-3 ✗]**: exactly **one** story-66 notice, the **first** Equipment request (step 5). Nothing from Parts 2–6, because she isn't assigned to any of these events.

To start over, re-run the two seeds.

---

## Not visible in the browser, and which automated test covers it

| What | Covered by |
|---|---|
| [AC-1/AC-2] The notice is saved **in the same transaction** as the release or rebook: if one fails, neither happens | `src/equipment/technical-support-notifier.spec.ts`: "US-66 AC-1: tells the assignee what was released, in the releasing transaction" |
| [AC-1/AC-2] The venue manager's **#40 notice is still sent alongside**. The [US-66] events have no venue bookings, so venue@ gets nothing here | `test/us66-technical-support-notifications.e2e-spec.ts`: "US-66 AC-1: the venue manager's US-40 notice is still sent alongside" and the AC-2 test of the same name |
| [AC-1 ✗] **Reject** with no live reservations (Part 5 tests cancel only) | e2e "US-66 AC-1: reject with no live reservations notifies no one" |
| [AC-3] The notice's link goes to the event's requirements page | e2e "US-66 AC-3: the notice links Technical Support to the event's requirements" |
| [AC-3] Removing every requirement says "All equipment and technical requirements were removed." Clearing the support needs also hides the Technical support staff card, so it isn't in the flow | unit "US-66 AC-3: says so when every requirement was removed" |
| The stored **recipient and type** (`EQUIPMENT_REQUEST_SUBMITTED`, `EQUIPMENT_RESERVATIONS_REBOOKED`, `EQUIPMENT_EVENT_CANCELLED`) | e2e, every AC test. By hand: `npx prisma studio` → **Notification** |
| The titles **Equipment request / Equipment rebooked / Equipment released** | `frontend/src/features/notifications/components/technical-support-notices.test.tsx` |

## Caveats

- **All three ACs are met by the current code.**
- **The Equipment rebooked message shows times in UTC** ("12 Nov, 10:00–14:00 UTC"), while the rest of the app shows SGT. It uses the same formatter as the #40 **Approved booking changed** notice it mirrors. Changing it is a code change, so I've left it.
- **If you seed on another day**, the event dates move. In step 15 use "the event's own date + 1", and in the step 19 message expect the event's own times in UTC (SGT minus 8 hours).
