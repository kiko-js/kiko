import { useState } from "react"

export const Child = () => {
  const [count, setCount] = useState(0)
  const doubled = count * 2
  return (
    <div>
      <p>Count: {count}</p>
      <p>Doubled: {doubled}</p>
      <div className="actions">
        <button onClick={() => setCount(count + 1)}>+1</button>
        <button onClick={() => setCount(count - 1)}>-1</button>
        <button onClick={() => setCount(0)}>Reset</button>
      </div>
    </div>
  )
}
