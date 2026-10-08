# Applied driving-video collection

Public page: https://minun001.github.io/VLA/#pipelineVideo

The page has five scenes and four independently downloadable videos per scene:

1. Original: native RGB from the same camera/frame window, 1920 x 600.
2. Perception: vehicle detection/tracking, road/structure masks and lane/corridor candidates, 1280 x 400.
3. Depth: the existing MetricAnything visible-surface heatmap, 624 x 196 (one padding row).
4. Relations / Temporal KG: perception context and BBox bottom-center connections beside the selected spatial and temporal graph, 1280 x 752.

View buttons keep the playback position within a scene; changing scene resets to its first frame. Previous/next controls step through 10 fps review frames. Each selected view has its own poster, dimensions, explanation and download. Source extraction/regrouping does not change inference or graph admission. Other-drive windows with no detected vehicle still have valid video frames; their graph can show no vehicle node.

## Videos and computation scope

- Original R1D1: 300 frames, 30 seconds of 10 fps review playback, 1,834 observations. This video reads the current review API and existing lossless RGB/depth cache.
- Additional R2D1/R3D1/R4D1/R5D1: 48 consecutive frames per drive, 4.8 seconds each. The models run again on every native frame. Tracking restarts in each window. Existing road/lane producers, core projection, main source/task lane gates and ontology qualifier are reused. Graphs remain isolated by camera and drive; legacy boundary namespaces are never merged across drives.

The additional videos are component execution with final image-lane gates, not a completed port of the R1D1-specific full scene compiler. VLM inference/training/effect evaluation are not run. Native focal length is read for each drive; MP4/calibration applicability, physical lanes, heading, connectivity, metric accuracy and bumper gap remain unverified. No vehicle is automatically excluded. Empty detection frames show no vehicle node and do not claim a true absence of vehicles.

other-drives.json is the website's small video catalogue. It records actual processing/count/media scope, not independent accuracy or a separate report. RGB binding and causal graph validation precede rendering. Every encoded frame presentation time is decoded and checked before export. Ten fps is review playback; observation elapsed time is separately printed. Additional drive clocks are video playback timestamps, not verified sensor capture times.

video-panels.json supplies the active four-view site. All 20 outputs are decoded with original presentation timestamps retained and every frame checked at t = n/10, starting at zero. Original RGB encoding is compared with first/middle/last input frames; other views are compared against the same rendered reference over all frames. This checks media fidelity/alignment, not physical accuracy. The existing combined videos remain unchanged. Spatial/temporal panels describe the selected vehicle, not a complete render of every graph node.

## Reproduce

- render_video.py --help: render the original clip from its review service, lossless RGB and depth cache.
- render_other_drives.py --help: infer/render four additional drives using existing models, NAS streaming and native calibration.
- split_video_panels.py --ssh-key PATH [--desktop-root PATH]: export four aligned views per scene from native RGB and existing results. No inference rerun. It writes website videos/posters/catalogue and, if requested, four MP4s in each Desktop scene folder.
- build.py --review-url URL: refresh earlier approved six-frame assets. It preserves the video-collection HTML/CSS/JS and does not refresh the videos.

The optional --reuse-depth-video rendering mode verifies the previous video bytes and matching drive/frame/focal scope, then reuses only that video's same-frame heatmap panel in RAM. It reruns road/detection/lane gates and checks unchanged counts. It never decodes a heatmap into numerical depth or uses it as graph evidence. This is a display refresh, not a second depth inference. The catalogue states the depth display source.

Use Python -B. Rendering source/font bytes travel over SSH stdin; no remote scratch script or font is saved. Additional-drive inference outputs stay in RAM. Only requested MP4s, JPG posters and the website catalogue are exported. Re-render videos when changing their underlying results. No raw-frame dumps, gated datasets, model weights or extra reports are published.

Four-view exports use a seekable anonymous RAM file on the Linux worker for normal fast-start MP4s. H.264 B-frames are disabled so browser time zero is the first source frame; timestamp checks use -copyts to detect offsets that FFmpeg's default normalization could conceal. RGB cropping preserves odd source rows (612 vs 613; 848 vs 849), with a one-pixel bottom pad for the Depth panel. Original camera frame positions are checked on every read. No temporary media is written to disk.

Serve this folder with a static HTTP server. Deploy main branch root through GitHub Pages. The published site needs no backend, credentials or external runtime dependencies.

PREVENTION media/derivatives: CC BY-NC-SA 3.0, attributed on the page. CASCADE and PhysicalAI media/annotations are not included.
