# Ontology-Based Temporal Knowledge Graphs for Anticipatory Driving

Public research demonstration: https://minun001.github.io/VLA/

The static page presents feature extraction, qualified image lane relations,
temporal observations and the planned VLM training/evaluation workflow.
It includes six representative PREVENTION frames, their admitted calculation
results, and a 30-second review playback. Physical lane membership, direction,
distance and connectivity accuracy remain unverified. VLM training is not run.

## Update

Run `python -B build.py --review-url URL --document PATH` against the existing
review service and the current approved Notion HTML. The builder validates the
camera, frame, coordinate and causal time scope, and exports only the fixed six
PREVENTION frames. It does not run or change the research algorithm.

Serve this folder with a static HTTP server for preview. Publish the root of
the `main` branch through GitHub Pages. No backend, account token, gated dataset
or model weight is required in the published site.

PREVENTION media and their displayed derivatives are attributed and provided
under CC BY-NC-SA 3.0; see the Data Sources section of the page. CASCADE and
PhysicalAI media/annotations are not included.
