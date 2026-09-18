import { lightboxItemFor } from '../lib/mediaTile';
import type { Block, ImageBlock, VideoBlock } from '../types';
import { Badge } from './Badge';
import { Bullets } from './Bullets';
import { Container } from './Container';
import { Dates } from './Dates';
import { Heading } from './Heading';
import { Image } from './Image';
import { useMediaLightbox } from './MediaLightbox';
import { Text } from './Text';
import { Video } from './Video';

interface Props {
  block: Block;
}

// Turns a media block into its lightbox opener, or undefined when there is
// nothing to open — no provider above us (the editor's path, and any future
// render outside TabbedContent), or a block the overlay can't display, such
// as a link to an arbitrary page. Undefined leaves the tile exactly as it is
// today: inert in the editor, a plain outbound link on the page.
function useMediaOpener(
  block: ImageBlock | VideoBlock,
): (() => void) | undefined {
  const open = useMediaLightbox();
  if (!open) return undefined;
  const item = lightboxItemFor(block);
  if (!item) return undefined;
  return () => open(item);
}

function ImageBlockView({ block }: { block: ImageBlock }) {
  const onOpen = useMediaOpener(block);
  return <Image block={block} onOpen={onOpen} />;
}

function VideoBlockView({ block }: { block: VideoBlock }) {
  const onOpen = useMediaOpener(block);
  return <Video block={block} onOpen={onOpen} />;
}

export function BlockRenderer({ block }: Props) {
  switch (block.type) {
    case 'container':
      return (
        <Container
          direction={block.direction}
          gap={block.gap}
          padding={block.padding}
          marginBottom={block.marginBottom}
          align={block.align}
          justify={block.justify}
          columns={block.columns}
          wrap={block.wrap}
          surface={block.surface}
        >
          {block.children.map((child, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: Static content tree rendered from admin-edited data, not client-side-reorderable UI state, so index keys are safe here.
            <BlockRenderer key={i} block={child} />
          ))}
        </Container>
      );
    case 'heading':
      return <Heading block={block} />;
    case 'text':
      return <Text block={block} />;
    case 'dates':
      return <Dates block={block} />;
    case 'bullets':
      return <Bullets block={block} />;
    case 'badge':
      return <Badge block={block} />;
    case 'image':
      return <ImageBlockView block={block} />;
    case 'video':
      return <VideoBlockView block={block} />;
    default: {
      // Exhaustiveness check: a new Block variant with no case here is a compile error.
      const _exhaustive: never = block;
      return _exhaustive;
    }
  }
}
