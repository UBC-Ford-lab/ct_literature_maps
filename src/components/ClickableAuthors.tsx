interface Props {
  authors: string;
  onClickAuthor: (name: string) => void;
}

export default function ClickableAuthors({ authors, onClickAuthor }: Props) {
  if (!authors) return null;

  const names = authors.split(", ");

  return (
    <p className="detail-authors clickable-authors">
      {names.map((name, i) => (
        <span key={i}>
          <button
            className="author-link"
            onClick={() => onClickAuthor(name.trim())}
          >
            {name.trim()}
          </button>
          {i < names.length - 1 && ", "}
        </span>
      ))}
    </p>
  );
}
