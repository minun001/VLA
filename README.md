# Ontology-Based Temporal Knowledge Graphs for Anticipatory Driving

Public research demonstration: https://minun001.github.io/VLA/

The static page introduces the research through the driving video, six selectable
scenes, four extraction/graph stages, and the planned VLM training/evaluation
workflow. The displayed graph edges reference admitted edges in scene-data.json;
held lane memberships remain unconnected. Video playback is separate from the
selected frame graph, and representative-scene selection seeks the video.
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
