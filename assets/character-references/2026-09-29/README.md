# Human character reference sheets

Created 29 September 2026 with the built-in image-generation tool, using the supplied image as a photographic style and sheet-layout reference. These are proposed modelling references; the game models have not been changed.

[Open visual gallery](index.html) · [Generation prompts and refinements](prompts.json) · [Original supplied reference](source-layout-reference.png)

## Roster

| Model identifier | Character | Sheet |
|---|---|---|
| `pedestrian_0` | Casual man | [PNG](00-casual-man.png) |
| `pedestrian_1` | Casual woman | [PNG](01-casual-woman.png) |
| `pedestrian_2` | Shirt-and-trousers man | [PNG](02-shirt-man.png) |
| `pedestrian_3` | Bob-haired woman | [PNG](03-bob-woman.png) |
| `pedestrian_4` | Older man with cane | [PNG](04-older-man-cane.png) |
| `pedestrian_5` | Older woman | [PNG](05-older-woman.png) |
| `pedestrian_6` | Boy with schoolbag | [PNG](06-boy-schoolbag.png) |
| `pedestrian_7` | Girl with schoolbag | [PNG](07-girl-schoolbag.png) |
| `pedestrian_8` | Man using wheelchair | [PNG](08-wheelchair-man.png) |
| `pedestrian_9` | Older woman using wheelchair | [PNG](09-wheelchair-older-woman.png) |
| `pedestrian_10` | Business man | [PNG](10-business-man.png) |
| `pedestrian_11` | Woman in green dress | [PNG](11-dress-woman.png) |
| `cyclist / seated_rider` | Cyclist | [PNG](12-cyclist.png) |

## Coverage of the game

Roster checked against `scripts/build_people.py:VARIANTS` (12 entries), `scripts/build_street_assets.py:cyclist`, and character spawning in `src/experience.js`. The older README statement of ten pedestrians is out of date.

- Platform passengers, boarders, people crossing the road and plaza pedestrians reuse the pedestrian roster.
- Seated NPCs reuse P00–P07, P10 and P11.
- Joggers reuse P00–P03, P10 and P11; they are activity roles, not separate character designs.
- Scooter riders currently reuse P01, P04, P07 and P10. No separate scooter-rider identity exists. Their riding pose and prop interactions need separate animation work; these sheets define their appearance.
- C12 is the separate cyclist model, with an additional riding inset.

## Modelling use

Every sheet supplies a face close-up and front, side and back views. P08 and P09 show the human seated in their wheelchair. Preserve clothing colour families, hair, accessories and overall silhouettes. Precise fictional ages and facial designs are art-direction choices, not new game metadata.

Start with silhouette, head/jaw/neck, shoulder and hip widths, elbow/knee positions, then cloth thickness, hems, shoes and hands. Treat clothing as garments with volume rather than colours painted on a rounded body. Keep chair, cane, bags, phone and bicycle independently controllable. The cane, briefcase and phone belong to the character's anatomical right hand; handbag and tote belong at the left hip.

These generated images are visual references, not calibrated orthographic scans: reconcile small view-to-view differences while modelling. Front/back views govern accessory handedness if a side view differs. Do not model incidental shoe marks as branding. Standing views are relaxed rather than strict rigging A-poses; establish a clean rest pose separately. All sheets use their own display scale, so child/adult physical height must come from the intended model scale, not equal pixel heights on different sheets.

Before accepting replacement models, compare front/side/back silhouette and close-up faces against these sheets, then inspect walking, sitting, running, child jumping and prop contact in the game. Image generation does not establish mesh quality or animation correctness.

