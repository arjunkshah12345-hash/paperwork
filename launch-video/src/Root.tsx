import React from 'react'
import { Composition, registerRoot } from 'remotion'
import { LaunchVideo } from './LaunchVideo'

const Root = () => <Composition id="PaperworkLaunch" component={LaunchVideo} durationInFrames={900} fps={30} width={1920} height={1080} />

registerRoot(Root)
