# BigBro

## Inspiration

We've all been there - opening our laptop with the best intentions to study or work, only to find ourselves two hours deep into YouTube, Reddit, or endlessly scrolling social media. Traditional productivity apps rely on self-reporting or simple website blockers that are easy to bypass. We wanted to create something different: a system that truly *knows* when you're slacking off and holds you accountable in ways you can't ignore.

The idea came from a simple truth: we're accountable to others in ways we aren't to ourselves. If someone else knows you're wasting time, you're far more likely to get back on track. BigBro brings that external accountability into the digital workspace, using cutting-edge AI and computer vision to monitor both what you're doing and whether you're actually paying attention.

## What it does

BigBro is a comprehensive productivity monitoring system that watches you work in two powerful ways:

**Task Monitoring**: BigBro continuously captures screenshots of your current browser tab and sends it to Claude AI along with the URL and your stated task. Claude analyzes whether you're actually working toward your goal or if you've drifted off-task. If you're caught slacking for more than a few seconds, you accumulate strikes.

**Attention Monitoring**: Using your webcam, BigBro tracks your face in real-time using MediaPipe and OpenCV. It detects three critical states:
- **Sleeping**: If your eyes close for more than a few seconds, an aggressive AI-generated wake-up message plays through Fish Audio's text-to-speech
- **Looking Away**: If you turn your head away from the screen for more than a few seconds, you get a strike
- **Not Present**: If you leave your desk for more than a few seconds, BigBro calls your phone via Vapi to bring you back

**The Strike System**: Accumulate 2 strikes, and BigBro escalates. It automatically calls your accountability partner (yes, your mom) via Vapi's phone API to report that you're off-task. This creates real consequences that can't be dismissed with a click.

**Analytics Dashboard**: A web interface shows your productivity stats, strike history, and session summaries, helping you understand your focus patterns over time.

## How we built it

BigBro combines multiple cutting-edge technologies into a cohesive monitoring pipeline:

**Chrome Extension (Frontend)**
- Built with Manifest V3 to access browser tabs and capture screenshots
- Background service orchestrates tab monitoring and coordinates with the vision server
- Popup interface for task setting and real-time status viewing

**Vision Analysis System (Python/Flask)**
- Flask server running on port 8080 handles all computer vision processing
- **MediaPipe Face Mesh** detects 468 3D facial landmarks in real-time
- **OpenCV** solves the Perspective-n-Point problem to calculate precise head orientation
  - Takes 6 key landmarks from MediaPipe (nose, chin, eyes, mouth)
  - Maps 2D pixel coordinates to a 3D face model
  - Computes yaw and pitch angles using Rodrigues transformation
- Eye Aspect Ratio (EAR) calculated from MediaPipe landmarks to detect eye closure
- State machine with four states: focused, sleeping, looking_away, not_present

**AI Integration**
- **Claude (Anthropic)**: Primary AI for sophisticated task analysis, handles nuanced "on-task" vs "off-task" decisions

**Alert Systems**
- **Fish Audio**: Text-to-speech for immediate local wake-up calls
- **Vapi**: Phone call automation that contacts accountability partners with actual phone calls

**Data Layer**
- **Supabase (PostgreSQL)**: Real-time database storing user settings, strikes, sessions, and events
- REST API for seamless integration across extension, vision server, and dashboard
- Row-level security for data protection

## Challenges we ran into

**3D Head Pose Estimation**: Getting accurate head orientation from webcam footage was far more complex than expected. We needed to understand the mathematical relationship between MediaPipe's 2D landmark coordinates and 3D head rotation. After researching computer vision literature, we implemented OpenCV's `solvePnP` (Perspective-n-Point) algorithm, which solves for camera pose given corresponding 3D-2D point pairs. The Rodrigues transformation then converts the rotation vector into interpretable yaw/pitch angles.

**State Machine Priority Logic**: Users can be in multiple "bad" states simultaneously (e.g., sleeping with head tilted down looks like both sleeping AND looking away). We had to implement a priority system where sleeping takes precedence over looking away, and each state transition properly resets timers for other states to prevent duplicate alerts.

**Real-time Performance**: Using MediaPipe face detection and OpenCV's 3D geometry calculations, we optimized to ~2 FPS processing rate and ensured the entire pipeline from camera capture to state determination completes in under 500ms. MediaPipe's CPU-only operation was crucial for accessibility.

**AI Prompt Engineering**: Getting Claude to reliably classify "on-task" vs "off-task" behavior required extensive prompt refinement. We needed it to understand nuanced scenarios - is reading documentation on-task for a programming project? Is watching a tutorial video productive or procrastination? The context of URL + screenshot + stated task was critical.

**Chrome Extension Manifest V3 Migration**: Google's transition to Manifest V3 required reworking background processes as service workers, which have different lifecycle management than persistent background pages. Coordinating screenshot capture, API calls, and strike tracking within these constraints required careful architectural planning.

## Accomplishments that we're proud of

**The MediaPipe + OpenCV Integration**: We successfully combined two powerful computer vision libraries in a way that leverages each one's strengths. MediaPipe provides fast, accurate landmark detection, while OpenCV handles the complex 3D geometry mathematics. The result is precise head pose estimation that runs in real-time on standard hardware.

**Multi-Tier Accountability System**: We built escalating consequences that actually work. Starting with gentle notifications, progressing to database-logged strikes, and culminating in real phone calls creates genuine accountability. The sleep detection system bypasses everything for immediate intervention - we're particularly proud of how aggressive and effective those AI-generated wake-up messages are.

**Seamless Cross-Component Integration**: Getting the Chrome extension, Python vision server, and web dashboard to work together through Supabase was a major achievement. All three components stay synchronized, with features like "dashboard starts monitoring → extension shows active status → vision server begins analysis" working flawlessly.

**Real-World Impact**: Early testing showed this actually works. The combination of AI task analysis and attention monitoring catches procrastination that traditional tools miss. You can't fool BigBro - it knows when you're actually working.

## What we learned

**Computer Vision is Powerful**: We gained deep understanding of facial landmark detection, 3D geometry transformations, and real-time video processing. The math behind head pose estimation (solvePnP, Rodrigues transformations, Euler angles) was fascinating and gave us new appreciation for the complexity behind "simple" face tracking.

**State Machines for Complex Logic**: Implementing the priority-based state machine taught us how to handle overlapping conditions elegantly. The clear priority hierarchy (sleeping > looking_away > focused > not_present) prevents edge cases and ensures consistent behavior.

**Accountability Works**: The most important lesson was behavioral: external accountability is incredibly powerful. When consequences involve other people (phone calls to mom), users actually modify their behavior. Technology motivates if designed correctly.

**API Integration Complexity**: Coordinating multiple external services (Claude, Fish Audio, Vapi, Supabase) taught us about error handling, fallback strategies, and managing API rate limits. Each service has different authentication, request formats, and response structures.

## What's next for BigBro

**Adaptive Threshold Tuning**: Use Letta AI's context memory to learn individual user patterns and automatically adjust thresholds. Some users naturally look away more while thinking; others have different baseline eye closure patterns. Personalized thresholds would reduce false positives.

**Mobile Companion App**: Extend monitoring to mobile devices. When BigBro detects you're away from your desk, track what you're doing on your phone. Are you answering work emails or doom-scrolling Instagram?

**Team Accountability Features**: Allow groups to monitor each other. Study groups could see collective productivity stats, and the system could call the most productive member when someone slacks off - peer pressure at scale.

**Sentiment Analysis**: Integrate facial expression analysis to detect frustration, confusion, or boredom. When users appear stuck, BigBro could proactively suggest breaks or offer help.

BigBro represents a new paradigm in productivity tools: not just tracking what you do, but truly understanding whether you're focused and holding you accountable in ways that actually change behavior.
