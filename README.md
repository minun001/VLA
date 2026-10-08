# Applied driving-video collection

Public page: https://minun001.github.io/VLA/#pipelineVideo

The page contains only processed research videos, a scene selector and short media information. Every video includes vehicle detection/tracking, road and structure segmentation, lane boundaries/corridor candidates, MetricAnything depth, BBox bottom-center image connections, and spatial/temporal graph displays. Choosing a thumbnail loads its own video, poster, title, counts and download.

## Videos and computation scope

- Original R1D1: 300 frames, 30 seconds of 10 fps review playback, 1,834 observations. This video reads the current review API and existing lossless RGB/depth cache.
- Additional R2D1/R3D1/R4D1/R5D1: 48 consecutive frames per drive, 4.8 seconds each. The models run again on every native frame. Tracking restarts in each window. Existing road/lane producers, core projection, main source/task lane gates and ontology qualifier are reused. Graphs remain isolated by camera and drive; legacy boundary namespaces are never merged across drives.

The additional videos are component execution with final image-lane gates, not a completed port of the R1D1-specific full scene compiler. VLM inference/training/effect evaluation are not run. Native focal length is read for each drive; MP4/calibration applicability, physical lanes, heading, connectivity, metric accuracy and bumper gap remain unverified. No vehicle is automatically excluded. Empty detection frames show no vehicle node and do not claim a true absence of vehicles.

other-drives.json is the website's small video catalogue. It records actual processing/count/media scope, not independent accuracy or a separate report. RGB binding and causal graph validation precede rendering. Every encoded frame presentation time is decoded and checked before export. Ten fps is review playback; observation elapsed time is separately printed. Additional drive clocks are video playback timestamps, not verified sensor capture times.

## Reproduce

- render_video.py --help: render the original clip from its review service, lossless RGB and depth cache.
- render_other_drives.py --help: infer/render four additional drives using existing models, NAS streaming and native calibration.
- build.py --review-url URL: refresh earlier approved six-frame assets. It preserves the video-collection HTML/CSS/JS and does not refresh the videos.

The optional --reuse-depth-video rendering mode verifies the previous video bytes and matching drive/frame/focal scope, then reuses only that video's same-frame heatmap panel in RAM. It reruns road/detection/lane gates and checks unchanged counts. It never decodes a heatmap into numerical depth or uses it as graph evidence. This is a display refresh, not a second depth inference. The catalogue states the depth display source.

Use Python -B. Rendering source/font bytes travel over SSH stdin; no remote scratch script or font is saved. Additional-drive inference outputs stay in RAM. Only requested MP4s, JPG posters and the website catalogue are exported. Re-render videos when changing their underlying results. No raw-frame dumps, gated datasets, model weights or extra reports are published.

Serve this folder with a static HTTP server. Deploy main branch root through GitHub Pages. The published site needs no backend, credentials or external runtime dependencies.

PREVENTION media/derivatives: CC BY-NC-SA 3.0, attributed on the page. CASCADE and PhysicalAI media/annotations are not included.