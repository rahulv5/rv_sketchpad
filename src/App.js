import React, { useEffect, useLayoutEffect, useState } from "react";
import rough from "roughjs/bundled/rough.esm";
import getStroke from "perfect-freehand";
import "./style.css";
const generator = rough.generator();

const createItem = (id, x1, y1, x2, y2, type, stroke) => {
  switch (type) {
    case "line":
    case "rectangle":
    case "circle":
    case "ellipse":
      const roughElement =
        type === "line"
          ? generator.line(x1, y1, x2, y2, {
              roughness: 0,
              stroke: stroke,
            })
          : type === "rectangle"
          ? generator.rectangle(x1, y1, x2 - x1, y2 - y1, {
              roughness: 0,
              stroke: stroke,
            })
          : type === "circle"
          ? generator.circle(x1, y1, x2 - x1, {
              bowing: 6,
              roughness: 0,
              stroke: stroke,
            })
          : type === "ellipse"
          ? generator.ellipse(x1, y1, x2 - x1, y2 - y1, {
              roughness: 0,
              stroke: stroke,
            })
          : "Neither";
      return { id, x1, y1, x2, y2, type, roughElement };
    case "pencil":
      return { id, type, points: [{ x: x1, y: y1 }] };
    default:
      throw new Error(`Type not recognised: ${type}`);
  }
};

const closeElement = (x, y, x1, y1, name) => {
  return Math.abs(x - x1) < 5 && Math.abs(y - y1) < 5 ? name : null;
};

const onLine = (x1, y1, x2, y2, x, y, maxDistance = 1) => {
  const a = { x: x1, y: y1 };
  const b = { x: x2, y: y2 };
  const c = { x, y };
  const offset = distance(a, b) - (distance(a, c) + distance(b, c));
  return Math.abs(offset) < maxDistance ? "inside" : null;
};

const currentPositionInElement = (x, y, element) => {
  const { type, x1, x2, y1, y2 } = element;
  switch (type) {
    case "line":
      const on = onLine(x1, y1, x2, y2, x, y);
      const start = closeElement(x, y, x1, y1, "start");
      const end = closeElement(x, y, x2, y2, "end");
      return start || end || on;
    case "rectangle":
    case "circle":
    case "ellipse":
      const topLeft = closeElement(x, y, x1, y1, "tl");
      const topRight = closeElement(x, y, x2, y1, "tr");
      const bottomLeft = closeElement(x, y, x1, y2, "bl");
      const bottomRight = closeElement(x, y, x2, y2, "br");
      const inside = x >= x1 && x <= x2 && y >= y1 && y <= y2 ? "inside" : null;
      return topLeft || topRight || bottomLeft || bottomRight || inside;
    case "pencil":
      const betweenAnyPoint = element.points.some((point, index) => {
        const nextPoint = element.points[index + 1];
        if (!nextPoint) return false;
        return (
          onLine(point.x, point.y, nextPoint.x, nextPoint.y, x, y, 5) != null
        );
      });
      return betweenAnyPoint ? "inside" : null;
    default:
      throw new Error(`Type not recognised: ${type}`);
  }
};

const distance = (a, b) =>
  Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));

const getElementAtPosition = (x, y, elements) => {
  return elements
    .map((element) => ({
      ...element,
      position: currentPositionInElement(x, y, element),
    }))
    .find((element) => element.position !== null);
};

const adjustCoordinates = (element) => {
  const { type, x1, y1, x2, y2 } = element;
  if (type === "rectangle" || type === "circle" || type === "ellipse") {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    return { x1: minX, y1: minY, x2: maxX, y2: maxY };
  } else {
    if (x1 < x2 || (x1 === x2 && y1 < y2)) {
      return { x1, y1, x2, y2 };
    } else {
      return { x1: x2, y1: y2, x2: x1, y2: y1 };
    }
  }
};

const cursorForPosition = (position) => {
  switch (position) {
    case "tl":
    case "br":
    case "start":
    case "end":
      return "nwse-resize";
    case "tr":
    case "bl":
      return "nesw-resize";
    default:
      return "move";
  }
};

const resizedCoordinates = (clientX, clientY, position, coordinates) => {
  const { x1, y1, x2, y2 } = coordinates;
  switch (position) {
    case "tl":
    case "start":
      return { x1: clientX, y1: clientY, x2, y2 };
    case "tr":
      return { x1, y1: clientY, x2: clientX, y2 };
    case "bl":
      return { x1: clientX, y1, x2, y2: clientY };
    case "br":
    case "end":
      return { x1, y1, x2: clientX, y2: clientY };
    default:
      return null; //should not really get here...
  }
};

const useHistory = (initialState) => {
  const [index, setIndex] = useState(0);
  const [history, setHistory] = useState([initialState]);

  const setState = (action, overwrite = false) => {
    const newState =
      typeof action === "function" ? action(history[index]) : action;
    if (overwrite) {
      const historyCopy = [...history];
      historyCopy[index] = newState;
      setHistory(historyCopy);
    } else {
      const updatedState = [...history].slice(0, index + 1);
      setHistory([...updatedState, newState]);
      setIndex((prevState) => prevState + 1);
    }
  };

  const undo = () => index > 0 && setIndex((prevState) => prevState - 1);

  return [history[index], setState, undo];
};

const getSvgPathFromStroke = (stroke) => {
  if (!stroke.length) return "";

  const d = stroke.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      return acc;
    },
    ["M", ...stroke[0], "Q"]
  );

  d.push("Z");
  return d.join(" ");
};

const drawElement = (roughCanvas, context, element, pencilColor) => {
  switch (element.type) {
    case "line":
    case "rectangle":
    case "circle":
    case "ellipse":
      roughCanvas.draw(element.roughElement);
      break;
    case "pencil":
      const stroke = getSvgPathFromStroke(getStroke(element.points));
      context.fillStyle = pencilColor;
      context.fill(new Path2D(stroke));
      break;
    default:
      throw new Error(`Type not recognised: ${element.type}`);
  }
};

const adjustmentRequired = (type) =>
  ["line", "rectangle", "circle", "ellipse"].includes(type);

const App = () => {
  const [elements, setElements, undo, redo] = useHistory([]);
  const [action, setAction] = useState("none");
  const [tool, setTool] = useState("pencil");
  const [selectedElement, setSelectedElement] = useState(null);
  const [stroke, setStroke] = useState("#000000");
  const [colorPicker, setColorPicker] = useState("#28FFBF");

  useLayoutEffect(() => {
    const canvas = document.getElementById("canvas");
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);

    const roughCanvas = rough.canvas(canvas);
    const pencilColor = stroke;

    elements.forEach((element) =>
      drawElement(roughCanvas, context, element, pencilColor)
    );
  }, [elements]);

  const updateElement = (id, x1, y1, x2, y2, type, stroke) => {
    const elementsCopy = [...elements];

    switch (type) {
      case "line":
      case "rectangle":
      case "circle":
      case "ellipse":
        elementsCopy[id] = createItem(id, x1, y1, x2, y2, type, stroke);
        break;
      case "pencil":
        elementsCopy[id].points = [
          ...elementsCopy[id].points,
          { x: x2, y: y2 },
        ];
        break;
      default:
        throw new Error(`Type not recognised: ${type}`);
    }

    setElements(elementsCopy, true);
  };

  const handleMouseDown = (event) => {
    const { clientX, clientY } = event;
    if (tool === "selection") {
      const element = getElementAtPosition(clientX, clientY, elements);
      if (element) {
        if (element.type === "pencil") {
          const xOffsets = element.points.map((point) => clientX - point.x);
          // for point in points:
          // const offset =  clientX- point.x
          const yOffsets = element.points.map((point) => clientY - point.y);
          setSelectedElement({ ...element, xOffsets, yOffsets });
        } else {
          const offsetX = clientX - element.x1;
          const offsetY = clientY - element.y1;
          setSelectedElement({ ...element, offsetX, offsetY });
        }
        setElements((prevState) => prevState);

        if (element.position === "inside") {
          setAction("moving");
        } else {
          setAction("resizing");
        }
      }
    } else {
      const id = elements.length;
      const element = createItem(
        id,
        clientX,
        clientY,
        clientX,
        clientY,
        tool,
        stroke
      );
      setElements((prevState) => [...prevState, element]);
      setSelectedElement(element);

      setAction("drawing");
    }
  };

  const handleMouseMove = (event) => {
    const { clientX, clientY } = event;

    if (tool === "selection") {
      const element = getElementAtPosition(clientX, clientY, elements);
      event.target.style.cursor = element
        ? cursorForPosition(element.position)
        : "default";
    }

    if (action === "drawing") {
      const index = elements.length - 1;
      const { x1, y1 } = elements[index];
      updateElement(index, x1, y1, clientX, clientY, tool, stroke);
    } else if (action === "moving") {
      if (selectedElement.type === "pencil") {
        const newPoints = selectedElement.points.map((_, index) => ({
          x: clientX - selectedElement.xOffsets[index],
          y: clientY - selectedElement.yOffsets[index],
        }));
        const elementsCopy = [...elements];
        elementsCopy[selectedElement.id] = {
          ...elementsCopy[selectedElement.id],
          points: newPoints,
        };
        setElements(elementsCopy, true);
      } else {
        const { id, x1, x2, y1, y2, type, offsetX, offsetY } = selectedElement;
        const width = x2 - x1;
        const height = y2 - y1;
        const newX1 = clientX - offsetX;
        const newY1 = clientY - offsetY;
        updateElement(
          id,
          newX1,
          newY1,
          newX1 + width,
          newY1 + height,
          type,
          stroke
        );
      }
    } else if (action === "resizing") {
      const { id, type, position, ...coordinates } = selectedElement;
      const { x1, y1, x2, y2 } = resizedCoordinates(
        clientX,
        clientY,
        position,
        coordinates
      );
      updateElement(id, x1, y1, x2, y2, type);
    }
  };

  const handleMouseUp = () => {
    if (selectedElement) {
      const index = selectedElement.id;
      const { id, type } = elements[index];
      if (
        (action === "drawing" || action === "resizing") &&
        adjustmentRequired(type)
      ) {
        const { x1, y1, x2, y2 } = adjustCoordinates(elements[index]);
        updateElement(id, x1, y1, x2, y2, type, stroke);
      }
    }
    setAction("none");
    setSelectedElement(null);
  };
  function refreshPage() {
    window.location.reload(false);
  }
  return (
    <div>
      <div style={{ position: "fixed", top: 10, padding: 20 }}>
        <label style={{ fontWeight: "bold" }}>Select Color: </label>
        <button
          className="btn btn-primary zoom"
          onClick={() => {
            setStroke("#990000"); //red
          }}
          style={{
            width: 50,
            height: 30,
            backgroundColor: "#990000",
            margin: 2,
          }}
        ></button>

        <button
          className="btn btn-primary zoom"
          onClick={() => {
            setStroke("#0000ff"); //blue
          }}
          style={{
            width: 50,
            height: 30,
            backgroundColor: "#0000ff",
            margin: 2,
          }}
        ></button>

        <button
          className="btn btn-primary zoom"
          onClick={() => {
            setStroke("#006600"); //green
          }}
          style={{
            width: 50,
            height: 30,
            backgroundColor: "#006600",
            margin: 2,
          }}
        ></button>
        <button
          className="btn btn-primary zoom"
          onClick={() => {
            setStroke("#cc0099"); // pink
          }}
          style={{
            width: 50,
            height: 30,
            backgroundColor: "#cc0099",
            margin: 2,
          }}
        ></button>
        <button
          className="btn btn-primary zoom"
          onClick={() => {
            setStroke("purple");
          }}
          style={{
            width: 50,
            height: 30,
            backgroundColor: "purple",
            margin: 2,
          }}
        ></button>
        <input
          type="color"
          class="form-control form-control-color"
          id="exampleColorInput"
          value={colorPicker}
          onInput={(event) => {
            setStroke(event.target.value);
            setColorPicker(event.target.value);
          }}
          style={{
            marginLeft: 370,
            marginTop: -37,
          }}
          title="Choose your color"
        ></input>
      </div>

      <div style={{ position: "fixed", top: 50, padding: 20 }}>
        <button
          style={{
            margin: 4,
            height: 50,
            width: 74,
            border: "none",
            fontSize: 15,
            color: "black",
            fontWeight: "bold",
          }}
          type="button"
          id="selection"
          className="btn btn-secondary blockButtons zoom"
          onClick={() => setTool("selection")}
        >
          Move
        </button>
        <button
          style={{ border: "none", margin: 4 }}
          type="button"
          id="line"
          className="btn btn-secondary blockButtons zoom"
          onClick={() => setTool("line")}
        >
          <img
            src="../images/line.png"
            alt="line"
            style={{ height: 50, width: 50 }}
          />
        </button>
        <button
          style={{ border: "none", margin: 4 }}
          type="button"
          id="rectangle"
          className="btn btn-secondary blockButtons zoom"
          onClick={() => setTool("rectangle")}
        >
          <img
            src="../images/rectangle.png"
            alt="rectangle"
            style={{ height: 50, width: 50 }}
          />
        </button>
        <button
          style={{ border: "none", margin: 4 }}
          type="button"
          id="circle"
          className="btn btn-secondary blockButtons zoom"
          onClick={() => setTool("circle")}
        >
          <img
            src="../images/circle.png"
            alt="circle"
            style={{ height: 50, width: 50 }}
          />
        </button>
        <button
          style={{ border: "none", margin: 4 }}
          type="button"
          id="ellipse"
          className="btn btn-secondary blockButtons zoom"
          onClick={() => setTool("ellipse")}
        >
          <img
            src="../images/ellipse.png"
            alt="ellipse"
            style={{ height: 50, width: 50 }}
          />
        </button>
        <button
          style={{ border: "none", margin: 4 }}
          type="button"
          id="pencil"
          className="btn btn-secondary blockButtons zoom"
          onClick={() => setTool("pencil")}
        >
          <img
            src="../images/pencil.png"
            alt="pencil"
            style={{ height: 50, width: 50 }}
          />
        </button>
        <button
          type="button"
          class="btn btn-success zoom"
          onClick={refreshPage}
          style={{
            margin: 4,
            height: 50,
            width: 74,
            border: "none",
          }}
        >
          Clear
        </button>
      </div>
      <div style={{ position: "fixed", bottom: 0, padding: 10 }}>
        <button
          type="button"
          class="btn btn-dark zoom"
          style={{ margin: 5 }}
          onClick={undo}
        >
          Undo
        </button>
      </div>
      <canvas
        id="canvas"
        style={{ backgroundColor: "#EEEEEE" }}
        width={window.innerWidth}
        height={window.innerHeight}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        Canvas
      </canvas>
    </div>
  );
};

export default App;
