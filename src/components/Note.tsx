interface Props {
  text: string;
}

export function Note({ text }: Props) {
  return <div className="placeholder">{text}</div>;
}
