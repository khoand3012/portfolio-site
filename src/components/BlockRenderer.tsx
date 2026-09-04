import type { Block } from '../types';
import { Badge } from './Badge';
import { Bullets } from './Bullets';
import { Container } from './Container';
import { Dates } from './Dates';
import { Heading } from './Heading';
import { Image } from './Image';
import { Text } from './Text';
import { Video } from './Video';

interface Props {
  block: Block;
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
      return <Image block={block} />;
    case 'video':
      return <Video block={block} />;
    default: {
      // Exhaustiveness check: a new Block variant with no case here is a compile error.
      const _exhaustive: never = block;
      return _exhaustive;
    }
  }
}
