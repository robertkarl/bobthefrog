# Unbiased Bob Challenge

**The challenge**: create a clone of the classic Frogger game, with a few
twists. The player guides Bob the Frog across multiple lanes of network
traffic, trying to safely reach any Localhost Lilypad. Vehicles drive in
opposite directions in each traffic lane - making contact with any vehicle
squishes Bob the Frog and ends the game. Dangerous rivers cross the terrain.
Most frogs can swim, but Bob the Frog will instantly drown if he falls into
the water!

## Constraints

- **Model**: anything goes! But no Strata... too easy.
- **VRAM**: strict 12GB limit
- **RAM**: strict 32GB limit
- **Programming language/framework**: your choice!
  Suggestions: pygame-ce, html/js, C++/SDL, Godot, whatever you like.

## The game

### Playable area

The playable area should occupy the main part of the display.
Bob the Frog always starts at the bottom of the playable area,
with the goal of safely reaching a safe Localhost Lilypad at
the top of the playable area. The playable area represents
a top-down view of the game.

The playable area is divided into logical square cells. Bob the Frog
always occupies exactly one cell. Cell dimensions can vary depending
on screen size and resolution, but the playable area should be at
least 16 cells wide by at least 25 cells tall. For example, if the
cell dimensions are 32x32, the playable area should be `32*16=512`
pixels wide and `32*25=800` pixels tall.

At the start of each game, the playable area is randomly generated
using the cell and hazard types described in this section. If the
game completes successfully, a new game should begin with a new
randomly-generated playable area and an increased difficulty
setting (vehicle speed increased by 1 cell per second per
successful completion, cap of 8 cells/second).

Rows are counted from the bottom to the top of the playable area.
The bottom row is row 0.

### Cell types

The following cell types are possible:
- grass: safe to traverse.
- bush (only appears on grass): Bob the Frog cannot enter this cell.
- asphalt (traffic lane): safe to traverse ONLY if no vehicle occupies this cell.
- sidewalk: safe to traverse.
- pylon (only appears on sidewalk): Bob the Frog cannot enter this cell.
- water: instant death upon entering.
- lilypad: safe to traverse.
- Localhost Lilypad: safe to traverse, and the game ends successfully!

### Traffic lanes

Traffic lanes consist of asphalt cells. Traffic lanes are always two
cells tall and stretch horizontally across the entire playable area.
There are no "diagonal" lanes. Each traffic lane has a predetermined
"direction", either left or right. This describes the direction of
traffic in that lane (see Traffic section). A traffic lane's direction
does not change.

Traffic lanes often come in pairs (two directly-adjacent lanes), though
this is not a hard requirement. A pair of traffic lanes always have
opposite directions. For example, a "left" lane might occupy rows 11 and
12 in the playable area, and a "right" lane occupies rows 13 and 14.

Traffic lanes sometimes have sidewalks, though this is not a hard requirement.
A sidewalk is a full row of sidewalk cells stretching alongside a traffic
lane across the entire playable area. Pylons can randomly appear on sidewalk
cells, to impede Bob the Frog's progress, with at most 15% density.
Sidewalks cannot appear on their own - they are always directly above
or below a traffic lane. For example, if a traffic lane occupies rows 7 and 8,
with no other traffic lanes next to it, then a sidewalk row could appear in
rows 6 and/or 9. If two lanes are directly adjacent, for example a "left"
lane in rows 16 and 17, and a "right" lane in rows 18 and 19, then a sidewalk
row could appear in rows 15 and/or 20.

Traffic lanes may border other traffic lanes, sidewalk rows, or grass.

Sidewalk rows must border a traffic lane on one side and grass on the other side.
Sidewalk rows never appear directly in between two traffic lanes!
Sidewalk rows never border other sidewalk rows!

### Rivers

Rivers consist of water cells. Rivers are always two cells tall and
stretch horizontally across the entire playable area. There are no
"diagonal" rivers. Water cells mean instant death for Bob the Frog,
but lilypads can provide safe traversal. Each river **must** have at
least one lilypad path to allow Bob the Frog to safely cross the river
(see "Starting position and pathing" section).

Rivers never directly border a traffic lane, a sidewalk lane,
or another river. Rivers can only border grass cells, or the top
edge of the playable area.

### Grassy areas

Any part of the playable area that is not occupied by a traffic lane,
a river, or a sidewalk, should be grass. Grass is safe to traverse.
Bushes can spawn randomly on grass (except on the bottom row) to impede
Bob the Frog's progress, with at most 15% density.

### Starting position and pathing

Bob the Frog always starts in any random cell in the bottom row.
**The bottom row is always safe (entirely grass cells)**.
There is never a hazard or an obstacle on the bottom row.

**There must always be a static path (ignoring vehicles) from the
bottom of the playable area to the top!** Take care when placing
bushes and pylons not to fully block the path! Take care when placing
rivers to ensure there are enough lilypads to traverse them!
Take care when placing the goal Localhost Lilypads to ensure that
Bob the Frog can reach them!

Since water is not traversable, lilypads must be placed to allow
safe crossing. Possible options:
- a single column where both river cells are lilypads (easy)
- a lilypad path that may require sideways hops within the river (hard)

**Implementation suggestion**: At level generation, perform a BFS/DFS
through static safe cells and ensure there is a path from Bob's start
position to all Localhost Lilypad goals. If validation fails,
regenerate.

### Goal

There is always a river in the top 2 rows of the playable area.
There are always **at least three** Localhost Lilypads in random
positions in this river. Entering any of these Localhost Lilypads
ends the game successfully. A Localhost Lilypad should be visually
distinct from a regular lilypad.

## Traffic

Vehicles spawn randomly in all traffic lanes, but never more frequently
than 1 per 2s per lane. Their starting position is fully outside the
playable area, and dependent on the traffic lane's direction: "left"
lanes spawn a new vehicle from the right side of the playable area,
and vice versa for "right" lanes. Vehicles travel at a constant rate of
4 cells per second in the lane's direction. When a vehicle has fully exited
the playable area, it is removed from play.

Bob the Frog dies instantly if he occupies the same cell as a vehicle
at any point. This means:
- if Bob the Frog enters a cell occupied by a vehicle: game over.
- if a vehicle enters Bob the Frog's current cell: game over.

Vehicles are always at least 2x2 cells in size. Larger vehicles
(trucks) can be 4x2 cells. Remember: traffic lanes are always 2 cells
tall, so vehicles always occupy the full height of a traffic lane.

Vehicles should never overlap other vehicles.

## Controls

The player uses the arrow keys to make Bob the Frog hop exactly
one cell in any orthogonal direction (left, right, up, down). There is
no diagonal movement. Bob the Frog cannot leave the playable area.

Suggestion: each keypress moves by one cell. Holding the key
does nothing.

Optional alternative: hold the arrow key to cause Bob the Frog
to repeatedly hop in that direction, at a rate of 2 hops per
second.

## Optional side-quests

For bonus points:
- use any local AI sound generator to create sfx and/or music.
- use any local TTS generator to create speech for the game.
  (suggestion: Bob the Frog should swear mildly when he dies)
- use any local AI image generator to render cover art and/or
  sprites for the game, in any style. (suggestions: a title
  screen with a cartoon Bob the Frog, a "game over" screen
  with a battered/squished frog, the more ridiculous, the better)
  
The VRAM and RAM limits apply to any tools used for these side quests!

