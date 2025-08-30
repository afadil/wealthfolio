interface SwingfolioIconProps {
  className?: string
  width?: number
  height?: number
}

export function SwingfolioIcon({ 
  className = "", 
  width = 20, 
  height = 20 
}: SwingfolioIconProps) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width={width} 
      height={height} 
      fill="currentColor" 
      viewBox="0 0 256 256"
      className={className}
    >
      <path
        d="M95.8,56.2a28,28,0,1,1-39.6,0A28,28,0,0,1,95.8,56.2Zm104,104a28,28,0,1,0,0,39.6A28,28,0,0,0,199.8,160.2Z"
        opacity="0.2"
      />
      <path
        d="M205.66,61.64l-144,144a8,8,0,0,1-11.32-11.32l144-144a8,8,0,0,1,11.32,11.31ZM50.54,101.44a36,36,0,0,1,50.92-50.91h0a36,36,0,0,1-50.92,50.91ZM56,76A20,20,0,1,0,90.14,61.84h0A20,20,0,0,0,56,76ZM216,180a36,36,0,1,1-10.54-25.46h0A35.76,35.76,0,0,1,216,180Zm-16,0a20,20,0,1,0-5.86,14.14A19.87,19.87,0,0,0,200,180Z"
      />
    </svg>
  )
}
