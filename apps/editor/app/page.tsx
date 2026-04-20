'use client'

import {
  Editor,
  type SidebarTab,
  ViewerToolbarLeft,
  ViewerToolbarRight,
  useUploadStore,
} from '@pascal-app/editor'
import { generateId, saveAsset, useScene } from '@pascal-app/core'
import { isTextFile, textToGlb } from '../lib/text-to-glb'
import { buildHouseScene, isHouseSpec, parseHouseSpec } from '../lib/house-builder'
import { AiPanel } from '../components/ai-panel'

const SIDEBAR_TABS: (SidebarTab & { component: React.ComponentType })[] = [
  {
    id: 'site',
    label: 'Scene',
    component: () => null, // Built-in SitePanel handles this
  },
  {
    id: 'ai',
    label: 'AI',
    component: AiPanel,
  },
]

async function handleUploadAsset(
  _projectId: string,
  levelId: string,
  file: File,
  type: 'scan' | 'guide',
) {
  const store = useUploadStore.getState()
  store.startUpload(levelId, type, file.name)
  store.setStatus(levelId, 'uploading')
  try {
    let url: string

    if (isTextFile(file)) {
      const textContent = await file.text()
      store.setStatus(levelId, 'confirming')
      store.setProgress(levelId, 10)

      if (isHouseSpec(textContent)) {
        // Parse the spec and build the scene directly — no GLB needed
        const spec = parseHouseSpec(textContent)
        buildHouseScene(spec, (pct) => store.setProgress(levelId, pct))
        store.setResult(levelId, 'scene://house')
        return
      }

      // Fallback: extrude first line as 3D text mesh
      const glbBuffer = await textToGlb(textContent, (pct) => store.setProgress(levelId, pct))
      store.setProgress(levelId, 97)
      const glbFile = new File(
        [glbBuffer],
        file.name.replace(/\.[^.]+$/, '') + '.glb',
        { type: 'model/gltf-binary' },
      )
      url = await saveAsset(glbFile)
    } else {
      url = await saveAsset(file)
    }

    const node = type === 'guide'
      ? { id: generateId('guide'), type: 'guide' as const, url, position: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: 1, opacity: 50 }
      : { id: generateId('scan'), type: 'scan' as const, url, position: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: 1, opacity: 100 }
    useScene.getState().createNode(node as any, levelId as any)
    store.setResult(levelId, url)
  } catch (err) {
    store.setError(
      levelId,
      err instanceof Error ? err.message : 'Failed to generate 3D model from text.',
    )
  }
}

export default function Home() {
  return (
    <div className="h-screen w-screen">
      <Editor
        layoutVersion="v2"
        projectId="local-editor"
        sidebarTabs={SIDEBAR_TABS}
        viewerToolbarLeft={<ViewerToolbarLeft />}
        viewerToolbarRight={<ViewerToolbarRight />}
        sitePanelProps={{
          projectId: 'local-editor',
          onUploadAsset: handleUploadAsset,
        }}
      />
    </div>
  )
}
