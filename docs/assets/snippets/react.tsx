import { ReactPortal } from "@kikojs/dom/react-portal"
import { MyReactChart } from "./ReactChart"

const data = createSignal([1, 2, 3])

<ReactPortal component={MyReactChart} data={data} />
