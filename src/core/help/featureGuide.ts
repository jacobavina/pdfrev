/**
 * Guía de funciones de REA (ADR-0100): el contenido de Help ▸ Feature Guide. Texto de interfaz, en inglés. Cada
 * entrada dice qué hace, dónde está y cómo se usa; los atajos son los reales de la aplicación.
 */

export interface GuideEntry {
  id: string;
  title: string;
  /** Qué hace, en una o dos frases. */
  summary: string;
  /** Cómo se usa, paso a paso. */
  steps: string[];
  /** Dónde está: menú, pestaña o panel. */
  where: string;
  shortcut?: string;
}

export interface GuideSection {
  id: string;
  title: string;
  entries: GuideEntry[];
}

export const FEATURE_GUIDE: GuideSection[] = [
  {
    id: 'start',
    title: 'Getting started',
    entries: [
      {
        id: 'open',
        title: 'Open a PDF',
        summary: 'Opens a drawing. Several documents can be open at once, each in its own tab with its own markups and history.',
        steps: ['Choose File ▸ Open PDF… or press Ctrl+O.', 'Pick a file. Recent files are under File ▸ Open Recent.', 'Click a tab to switch documents.'],
        where: 'File ▸ Open PDF…',
        shortcut: 'Ctrl+O',
      },
      {
        id: 'save',
        title: 'Save your markups',
        summary: 'Markups are saved in the PDF as standard annotations, so Revu and Acrobat show and edit them.',
        steps: ['Press Ctrl+S to save. A document without a file yet asks where to save (Save As).', 'Autosave keeps a safety copy while you work.'],
        where: 'File ▸ Save',
        shortcut: 'Ctrl+S',
      },
      {
        id: 'profiles',
        title: 'Interface profiles',
        summary: 'Switches the whole window layout for the kind of work: Review, Takeoff, Field, or your own Custom layout.',
        steps: [
          'Choose View ▸ Profiles and pick Review, Takeoff or Field.',
          'Arrange the window the way you like, then View ▸ Profiles ▸ Save Current Layout as Custom.',
          'The profile you choose is remembered next time.',
        ],
        where: 'View ▸ Profiles',
      },
      {
        id: 'shortcuts',
        title: 'Keyboard shortcuts',
        summary: 'Lists every shortcut, including one letter per tool.',
        steps: ['Press F1 or choose Help ▸ Keyboard Shortcuts.'],
        where: 'Help ▸ Keyboard Shortcuts',
        shortcut: 'F1',
      },
    ],
  },
  {
    id: 'view',
    title: 'Viewing the drawing',
    entries: [
      {
        id: 'zoom',
        title: 'Zoom and pan',
        summary: 'Zoom at the cursor with the wheel; pan with Space or the middle button while any tool is active.',
        steps: [
          'Hold Ctrl and turn the wheel to zoom at the cursor.',
          'Double-click, then turn the wheel toward you to zoom in or away to zoom out at that point.',
          'Hold Space or the middle button and drag to pan, or choose the Pan tool with Shift+V.',
        ],
        where: 'View ▸ Zoom In / Zoom Out',
        shortcut: 'Ctrl+wheel',
      },
      {
        id: 'fit',
        title: 'Fit page, fit width, actual size',
        summary: 'Fits the whole sheet, its width, or 100 % in the window.',
        steps: ['Use View ▸ Fit Page, Fit Width or Actual Size.'],
        where: 'View ▸ Fit Page',
        shortcut: 'Ctrl+9 / Ctrl+0 / Ctrl+8',
      },
      {
        id: 'zoom-window',
        title: 'Zoom window',
        summary: 'Zooms to a rectangle you drag. Sheets larger than the browser canvas limit are drawn region by region, so they never go blank.',
        steps: ['Press Z, then drag a rectangle around the area to zoom to.'],
        where: 'Tool Z',
        shortcut: 'Z',
      },
      {
        id: 'view-mode',
        title: 'Single page or continuous pages',
        summary: 'Shows one page at a time, or all pages stacked with scrolling.',
        steps: ['Choose View ▸ Single Page or Continuous Pages.'],
        where: 'View ▸ Single Page',
        shortcut: 'Ctrl+4 / Ctrl+5',
      },
      {
        id: 'rotate-view',
        title: 'Rotate the view',
        summary: 'Turns the view 90° without changing the PDF.',
        steps: ['Choose View ▸ Rotate View Clockwise or Counterclockwise.'],
        where: 'View ▸ Rotate View',
      },
      {
        id: 'rulers',
        title: 'Rulers',
        summary: 'Shows rulers in the units of the page scale, so you can read positions on the drawing.',
        steps: ['Choose View ▸ Rulers or press Ctrl+R.'],
        where: 'View ▸ Rulers',
        shortcut: 'Ctrl+R',
      },
      {
        id: 'dark',
        title: 'Dark mode',
        summary: 'Switches between the light and dark interface, or follows the system theme.',
        steps: ['Choose View ▸ Dark Mode or press Ctrl+3.'],
        where: 'View ▸ Dark Mode',
        shortcut: 'Ctrl+3',
      },
      {
        id: 'search',
        title: 'Find text',
        summary: 'Searches the text of the drawing and highlights each match.',
        steps: ['Press Ctrl+F, type the text, and move between matches.'],
        where: 'Document ▸ Find Text…',
        shortcut: 'Ctrl+F',
      },
    ],
  },
  {
    id: 'markup',
    title: 'Markup tools',
    entries: [
      {
        id: 'select',
        title: 'Select, move and reshape',
        summary: 'Click a markup to select it. Yellow handles reshape it, blue squares scale it and the round handle rotates it.',
        steps: [
          'Press V, then click a markup. Drag a rectangle to select several.',
          'Drag the markup to move it, or a handle to reshape, scale or rotate it.',
          'Right-click for the markup context menu.',
        ],
        where: 'Markup tab ▸ Select',
        shortcut: 'V',
      },
      {
        id: 'text',
        title: 'Text box, typewriter, callout and note',
        summary: 'Text box and typewriter place text. A callout points at something with an arrow. A note is a sticky comment.',
        steps: [
          'Text box (T) and typewriter (W): drag a box, then type.',
          'Callout (Q): click the tip of the arrow, then click where the text goes. Dragging also works.',
          'Note (N): click where the note goes.',
          'Autosize Text in Properties fits the text to its box.',
        ],
        where: 'Markup tab ▸ Text & Review',
        shortcut: 'T / W / Q / N',
      },
      {
        id: 'text-markup',
        title: 'Highlight, underline, squiggly, strike-through',
        summary: 'Marks text in the drawing. Needs a PDF with selectable text.',
        steps: ['Press Shift+H, U, Shift+U or D, then drag across the text.'],
        where: 'Markup tab ▸ Text & Review',
        shortcut: 'Shift+H / U / Shift+U / D',
      },
      {
        id: 'draw',
        title: 'Pen, highlighter, line, arrow, arc, rectangle, ellipse, polyline, polygon',
        summary: 'Freehand and shape tools. Shift keeps lines at 0°, 45° and 90° and shapes square or circular.',
        steps: [
          'Pen (P), highlighter (H), line (L), arrow (A), rectangle (R), ellipse (E).',
          'Arc (Shift+C): three clicks. Polyline (Shift+N) and polygon (Shift+P): click each vertex, then Enter or double-click to finish.',
          'Lines and arrows accept click, click as well as dragging.',
        ],
        where: 'Markup tab ▸ Draw',
        shortcut: 'P / H / L / A / R / E / Shift+C / Shift+N / Shift+P',
      },
      {
        id: 'cloud',
        title: 'Revision clouds',
        summary: 'Cloud outlines a change. Cloud+ adds a callout note joined to the cloud.',
        steps: [
          'Press C for Cloud or K for Cloud+, then draw the area.',
          'Change scallop size and invert in Properties. Any dash line style keeps it a cloud; pattern styles turn it into a plain shape.',
        ],
        where: 'Markup tab ▸ Draw ▸ Cloud / Cloud+',
        shortcut: 'C / K',
      },
      {
        id: 'stamp',
        title: 'Stamps',
        summary: 'Places a ready-made stamp such as Approved, Reviewed or a sign-here mark.',
        steps: ['Open the Insert tab, choose a stamp, then click or drag on the drawing.'],
        where: 'Insert tab ▸ Stamp',
        shortcut: 'S',
      },
      {
        id: 'sequence',
        title: 'Numbered sequence',
        summary: 'Each click places the next number (1, 2, 3, or A, B, C, or I, II, III) as a text box.',
        steps: [
          'Choose Numbered Sequence in Text & Review.',
          'In Properties pick the format, prefix, suffix and the next number.',
          'Click on the drawing once per marker.',
        ],
        where: 'Markup tab ▸ Text & Review ▸ Sequence',
      },
      {
        id: 'eraser',
        title: 'Eraser',
        summary: 'Splits or trims freehand strokes.',
        steps: ['Press Shift+E, then drag across the stroke.'],
        where: 'Markup tab ▸ Draw ▸ Eraser',
        shortcut: 'Shift+E',
      },
      {
        id: 'snapshot',
        title: 'Snapshot',
        summary: 'Copies a region of the drawing as an image. Paste it on any page with Ctrl+V.',
        steps: ['Press G, drag around the region, then Ctrl+V on the page where you want it.'],
        where: 'Edit ▸ Snapshot',
        shortcut: 'G',
      },
      {
        id: 'link',
        title: 'Hyperlinks and attachments',
        summary: 'A hyperlink jumps to a page or opens an address. An attachment embeds a file in the PDF.',
        steps: ['Choose Tools ▸ Hyperlink or File Attachment, then draw or click on the drawing.', 'Ctrl+click a hyperlink to follow it.'],
        where: 'Tools ▸ Hyperlink / File Attachment',
      },
      {
        id: 'forms',
        title: 'Form fields and signatures',
        summary: 'Adds fillable fields and signs the document with a digital certificate.',
        steps: ['Choose Tools ▸ Form for fields, or Tools ▸ Signature ▸ Signature Field, then sign it from Properties.'],
        where: 'Tools ▸ Form / Signature',
      },
    ],
  },
  {
    id: 'edit',
    title: 'Editing markups',
    entries: [
      {
        id: 'properties',
        title: 'Properties',
        summary: 'Line colour, width and style, fill, hatch, opacity, text font and size, status, author and comment.',
        steps: ['Select a markup and open Properties (Alt+P).', 'With a drawing tool active, Properties sets the style of what you are about to draw.'],
        where: 'Properties panel',
        shortcut: 'Alt+P',
      },
      {
        id: 'line-styles',
        title: 'Line styles and hatch',
        summary: 'Solid, six dashed styles, dotted, cloud, fenceline, gas, zig zag, insulation, double, tracks and road. Shapes can be hatched.',
        steps: ['Pick the line style in the Line section of Properties.', 'Pick a hatch pattern in the Fill section.'],
        where: 'Properties ▸ Line / Fill',
      },
      {
        id: 'text-offset',
        title: 'Move the value text of a Length or Dimension',
        summary: 'Separates the measurement text from its arrows when they overlap, as on short distances.',
        steps: [
          'Select the Length or Dimension.',
          'Drag the diamond handle above the text, or type the offset in Properties ▸ Text offset. Reset puts it back.',
        ],
        where: 'Properties ▸ Text offset',
      },
      {
        id: 'arrange',
        title: 'Align, distribute and flip',
        summary: 'Aligns several markups to each other, spreads them evenly, or mirrors them.',
        steps: ['Select two or more markups (three to distribute), then use Edit ▸ Align & Flip.'],
        where: 'Edit ▸ Align & Flip',
      },
      {
        id: 'copy',
        title: 'Copy, paste, duplicate, lock and delete',
        summary: 'Standard editing for markups. Locked markups cannot be moved or edited.',
        steps: ['Ctrl+C, Ctrl+V and Ctrl+D copy, paste and duplicate. Del deletes.', 'Edit ▸ Lock / Unlock protects a markup.'],
        where: 'Edit menu',
        shortcut: 'Ctrl+C / Ctrl+V / Ctrl+D',
      },
      {
        id: 'review',
        title: 'Status and replies',
        summary: 'Review status (Pending, Accepted, Rejected, Completed…) and threaded replies on any markup.',
        steps: ['Right-click a markup ▸ Set Status, or choose the status in Properties.', 'Reply… adds a comment in a thread, visible in Revu and Acrobat.'],
        where: 'Right-click ▸ Set Status / Reply…',
      },
      {
        id: 'layers',
        title: 'Layers',
        summary: 'Hides or shows the layers of the PDF and the layers of your markups.',
        steps: ['Open the Layers panel on the left and click the eye of a layer.'],
        where: 'Left panel ▸ Layers',
      },
      {
        id: 'toolchest',
        title: 'Tool Chest',
        summary: 'Saves a markup, with its style, as a reusable tool in a tool set. Measurement tools keep their subject and price.',
        steps: ['Open the Tool Chest panel on the right.', 'Add a markup to a tool set from the Markups list or its context menu, then drag a tool onto the drawing.'],
        where: 'Right panel ▸ Tool Chest',
      },
      {
        id: 'undo',
        title: 'Undo and redo',
        summary: 'Every edit is one undoable step, up to 50 steps per document.',
        steps: ['Press Ctrl+Z to undo and Ctrl+Y to redo.'],
        where: 'Edit ▸ Undo / Redo',
        shortcut: 'Ctrl+Z / Ctrl+Y',
      },
    ],
  },
  {
    id: 'measure',
    title: 'Measuring and takeoff',
    entries: [
      {
        id: 'scale',
        title: 'Set the scale',
        summary: 'Calibrates a page so measurements show real units. A page can have several scales, one per viewport.',
        steps: ['Choose Tools ▸ Measure ▸ Set Scale…, or Calibrate in the Measure tab.', 'Click two points of a known distance and type it.'],
        where: 'Measure tab ▸ Calibrate',
      },
      {
        id: 'length',
        title: 'Length, Polylength and Dimension',
        summary: 'Measures distances. Length draws arrow ends and shows the value; Dimension draws a dimension line with extension lines.',
        steps: [
          'Length (Shift+Alt+L): click two points, move to place the line and click a third, or just drag for a quick distance.',
          'Polylength (Shift+Alt+Q): click each vertex to add up a path, then Enter.',
          'Dimension (Shift+L): drag, then type or accept the value.',
          'Short distances put the arrows outside; move the text if it overlaps.',
        ],
        where: 'Measure tab ▸ Length / Polylength',
        shortcut: 'Shift+Alt+L / Shift+Alt+Q / Shift+L',
      },
      {
        id: 'area',
        title: 'Area, perimeter and volume',
        summary: 'Click each vertex and finish with Enter or a double-click. Cutouts subtract holes; volume multiplies by a depth.',
        steps: [
          'Area (Shift+Alt+A), Perimeter (Shift+Alt+P), Volume (Shift+Alt+V).',
          'To subtract a hole from an area, select it and use Add Cutout (Shift+Alt+K).',
        ],
        where: 'Measure tab ▸ Area / Perimeter / Volume',
        shortcut: 'Shift+Alt+A',
      },
      {
        id: 'dynamic-fill',
        title: 'Dynamic Fill',
        summary: 'One click inside an enclosed area measures it. Small gaps between lines are closed automatically.',
        steps: [
          'Press J or choose Fill in the Measure tab.',
          'Click inside the room. If the area is not closed, raise Gap in Properties or close the outline.',
        ],
        where: 'Measure tab ▸ Fill',
        shortcut: 'J',
      },
      {
        id: 'angle',
        title: 'Angle, radius and diameter',
        summary: 'Measures angles and circle sizes.',
        steps: ['Angle (Shift+Alt+G): three clicks. Radius (Shift+Alt+U) and Diameter (Shift+Alt+D): centre and edge.'],
        where: 'Measure tab',
        shortcut: 'Shift+Alt+G / U / D',
      },
      {
        id: 'count',
        title: 'Count',
        summary: 'Counts items with a symbol (check, triangle, square, circle, diamond). One count is one markup with the total in the status bar.',
        steps: ['Press Shift+Alt+C, click each item. Enter or Esc ends the count. Change symbol and scale in Properties.'],
        where: 'Measure tab ▸ Count',
        shortcut: 'Shift+Alt+C',
      },
      {
        id: 'takeoff',
        title: 'Takeoff totals, prices and Excel',
        summary: 'Subtotals by subject and layer with unit prices, exported to Excel with live formulas.',
        steps: [
          'Open the Measurements panel (View ▸ Measurements Panel).',
          'Give each measurement a subject and a unit price.',
          'Export Takeoff Schedule (Excel .xlsx) from the Markups list or File ▸ Export.',
        ],
        where: 'Measurements panel',
      },
      {
        id: 'snap',
        title: 'Snap',
        summary: 'Snaps the cursor to endpoints, midpoints, intersections and to the lines of the drawing.',
        steps: ['Turn each snap on or off in the Measurements panel. Ctrl+Shift+F7 snaps to markups and Ctrl+Shift+F8 to content.'],
        where: 'Measurements panel ▸ Snap',
        shortcut: 'Ctrl+Shift+F7 / F8',
      },
    ],
  },
  {
    id: 'pages',
    title: 'Pages and documents',
    entries: [
      {
        id: 'page-ops',
        title: 'Insert, rotate, delete, extract and reorder pages',
        summary: 'Edits the pages of the PDF. Markups, scales and links follow their pages.',
        steps: [
          'Document menu: Insert Blank Page After, Rotate Page 90°, Extract Page…, Delete Page.',
          'Reorder by dragging a thumbnail in the Pages panel.',
        ],
        where: 'Document menu / Pages panel',
        shortcut: 'Ctrl+Shift+R / Ctrl+Shift+X',
      },
      {
        id: 'combine',
        title: 'Combine files',
        summary: 'Joins several PDFs into one, keeping their markups.',
        steps: ['File ▸ Combine Files…, add the files, set the order and combine.'],
        where: 'File ▸ Combine Files…',
      },
      {
        id: 'labels',
        title: 'Page labels and bookmarks',
        summary: 'Shows the page labels (i, ii, A-1…) and the bookmarks of the PDF.',
        steps: ['Open the Bookmarks panel on the left. Labels appear under the thumbnails and in the status bar.'],
        where: 'Left panel ▸ Bookmarks',
      },
      {
        id: 'compare',
        title: 'Compare Documents',
        summary: 'Compares this page with the same page of another revision and marks every change with a cloud on the Comparison layer.',
        steps: ['Choose Document ▸ Compare Documents… and pick the other revision.', 'One undo removes all the clouds.'],
        where: 'Document ▸ Compare Documents…',
      },
      {
        id: 'overlay',
        title: 'Overlay pages and side by side',
        summary: 'Overlays two pages in two colours, or shows them next to each other with synchronised zoom and scroll.',
        steps: ['Document ▸ Overlay Pages, then align with two or three pairs of points.', 'Document ▸ Side by Side for the split view.'],
        where: 'Document ▸ Overlay Pages / Side by Side',
      },
      {
        id: 'flatten',
        title: 'Flatten and unflatten',
        summary: 'Burns the markups into the page. A PDF flattened by REA can be unflattened to get the editable markups back.',
        steps: [
          'File ▸ Export ▸ PDF with Flattened Markups…',
          'Open that file and choose File ▸ Export ▸ Unflatten Markups of This PDF.',
        ],
        where: 'File ▸ Export',
      },
    ],
  },
  {
    id: 'reports',
    title: 'Markups list and reports',
    entries: [
      {
        id: 'markups-list',
        title: 'Markups list',
        summary: 'Every markup in a table: filter, sort, group by subject, choose columns, edit comments and status.',
        steps: ['Press Alt+L. Use the Markups List menu for Columns and Group by Subject.', 'Click a row to go to its markup.'],
        where: 'Status bar ▸ Markups List',
        shortcut: 'Alt+L',
      },
      {
        id: 'csv',
        title: 'Export the list to CSV or Excel',
        summary: 'Saves the visible markups with their columns.',
        steps: ['Use the CSV and Excel buttons in the Markups list, or File ▸ Export.'],
        where: 'Markups list / File ▸ Export',
      },
      {
        id: 'report',
        title: 'PDF summary report',
        summary: 'A report with totals by status, author, type and subject, thumbnails of the sheets with their markups, and a linked table.',
        steps: ['Use PDF Report in the Markups list, or Append Summary to add the report to the PDF itself.'],
        where: 'Markups list ▸ PDF Report / Append Summary',
      },
    ],
  },
];

/** Todas las entradas con el título de su sección, para buscar. */
export function allGuideEntries(): (GuideEntry & { section: string })[] {
  return FEATURE_GUIDE.flatMap((s) => s.entries.map((e) => ({ ...e, section: s.title })));
}

/** Entradas que contienen todas las palabras de la consulta (sin distinguir mayúsculas), en el orden de la guía. */
export function searchGuide(query: string): (GuideEntry & { section: string })[] {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return allGuideEntries();
  return allGuideEntries().filter((e) => {
    const hay = [e.title, e.summary, e.where, e.shortcut ?? '', e.section, ...e.steps].join(' ').toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
