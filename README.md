# Ontology-Based Temporal Knowledge Graphs for Anticipatory Driving

Public research demonstration: https://minun001.github.io/VLA/

The static page introduces the research through a 300-frame combined pipeline
video, its original driving video, six selectable
scenes, four extraction/graph stages, and the planned VLM training/evaluation
workflow. The displayed graph edges reference admitted edges in scene-data.json;
held lane memberships remain unconnected. Video playback is separate from the
selected detail graph, and representative-scene selection seeks both videos.
The combined video carries its own graph, updated at every video frame.
It includes six representative PREVENTION frames, their admitted calculation
results, and a 30-second review playback. Physical lane membership, direction,
distance and connectivity accuracy remain unverified. VLM training is not run.

## Update

Run `python -B build.py --review-url URL` against the existing review service
to refresh the approved public data. Add `--document PATH` only when refreshing
illustration assets from the approved Notion HTML. The builder preserves the
authored `index.html`, `public.css` and `app.js`. It validates the
camera, frame, coordinate and causal time scope, and exports only the fixed six
PREVENTION frames. It does not run or change the research algorithm.

Serve this folder with a static HTTP server for preview. Publish the root of
the `main` branch through GitHub Pages. No backend, account token, gated dataset
or model weight is required in the published site.

PREVENTION media and their displayed derivatives are attributed and provided
under CC BY-NC-SA 3.0; see the Data Sources section of the page. CASCADE and
PhysicalAI media/annotations are not included.

## Applied pipeline video

`render_video.py` reads the existing 300-frame PREVENTION review API, lossless RGB
and cached MetricAnything maps. It combines vehicle boxes/tracking hypotheses,
road/structure masks, detected lane boundaries and qualified corridor candidates,
depth/quality displays, raw image-space connections, and admitted spatial and
past-observation graph edges. It does not run or modify the research algorithm.

RGB checksums, camera/native coordinates, source clocks, known-at references and
lane admission are checked before rendering. The H.264 product is decoded again
to verify all 300 presentation times. Ten frames per second is review playback;
the original observation elapsed time is printed separately. The video does not
claim verified physical lanes, motion direction, bumper distance or VLM gains.

Run with `python -B render_video.py --help` for the explicit SSH/runtime, existing
review service, sample directory and font arguments. The rendering source and
font bytes stay in worker memory; only the requested video and poster are saved.
Rerender this video when refreshing the underlying research results; do not
represent a newer API run with an older encoded video. The public products are
`assets/processed-techniques.mp4` and `.jpg`. No frame
dumps, reports, model weights or additional datasets are exported.
