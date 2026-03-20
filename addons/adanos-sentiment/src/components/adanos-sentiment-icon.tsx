interface AdanosSentimentIconProps {
  className?: string;
  width?: number;
  height?: number;
}

export function AdanosSentimentIcon({
  className = "",
  width = 20,
  height = 20,
}: AdanosSentimentIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      fill="currentColor"
      viewBox="0 0 256 256"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M48,184a8,8,0,0,1,0-16H76.6l31.5-58.6a8,8,0,0,1,12.8-1.7l32,32,37.5-45a8,8,0,0,1,13.6,2.7L222.5,168H208a8,8,0,0,1,0,16Z"
        opacity="0.2"
      />
      <path d="M208,184H48a8,8,0,0,1,0-16H71.8l29.2-54.2a16,16,0,0,1,25.7-3.4l25.8,25.8,31.8-38.2a16,16,0,0,1,27.2,5.3L229.7,164H232a8,8,0,0,1,0,16Zm-122.2-16H212.9l-16.4-49.3L164.3,157a8,8,0,0,1-11.8.7l-37.2-37.2ZM48,72a8,8,0,0,1,8-8H88a8,8,0,0,1,0,16H56A8,8,0,0,1,48,72Zm64,0a8,8,0,0,1,8-8h24a8,8,0,0,1,0,16H120A8,8,0,0,1,112,72Zm56,0a8,8,0,0,1,8-8h24a8,8,0,0,1,0,16H176A8,8,0,0,1,168,72Z"></path>
    </svg>
  );
}
