/* ============================================================
   FIELD NOTES — photo manifest
   ------------------------------------------------------------
   Generated from Chris's own photographs.

   Each entry points at two derivatives of the same original:
     photos/thumb/NAME.jpg   700px  — the gallery grid
     photos/full/NAME.jpg   1600px  — the full-screen viewer
   The untouched originals live in Portfolio-V1.1-main/images.

   TO ADD A PHOTO
     1. Drop the original alongside the others and run the resize
        (see README, "Adding photos").
     2. Add a p("Your-File.jpg") line to the right list below.

   TO CAPTION ONE
     p("Travel-12.jpg", "morning ferry", "Sydney Harbour")
        caption ---^                       ^--- where it was taken
     Both are optional and only show in the full-screen viewer: the caption
     in handwriting, the place in type beside it. Without them the viewer
     shows the gallery's name.

   TO SHOW ONE BIG
     Add its file name to that gallery's `featured` list. Featured photos
     take two columns, and one of them (picked at random) leads the page.
     Landscape-shaped photos work best; three to five per gallery is plenty.

   TO REMOVE ONE
     Delete its line. Nothing else needs changing.
   ============================================================ */

function p(file, caption, place) {
  return {
    thumb: "photos/thumb/" + file,
    src:   "photos/full/" + file,
    caption: caption || "",
    place: place || "",
    alt: caption ? caption + (place ? " — " + place : "") : "Photograph by Chris Manning",
  };
}

const SITE = {
  name: "Chris Manning",
  tagline: "Photography for people, places & projects",

  dogName: "Felix",

  email: "cm@chrisclicks.com",
  location: "Boston, MA, USA",
  copyright: "© 2024 Chris Manning. All rights reserved.",

  /* The live form endpoint carried over from chrisclicks.com. */
  formEndpoint:
    "https://script.google.com/macros/s/AKfycbyqRWv_tdv2EcuN5bj5xNRmPV_OtN8HXEPNPYv9jxhgQmQMNcGZsPNay8dtu7K4-PaJ7w/exec",

  collections: {
    peaks: {
      title: "Peaks & Wilds",
      pageNo: 12,
      blurb: "Landscapes — mountains, high country, and the light that made me stop walking.",
      featured: ["Landscape-28.jpg", "Landscape-15.jpg", "Landscape-34.jpg", "Landscape-33.jpg"],
      photos: [
        p("Landscape-01.jpg"),
        p("Landscape-02.jpg"),
        p("Landscape-03.jpg"),
        p("Landscape-04.jpg"),
        p("Landscape-05.jpg"),
        p("Landscape-06.jpg"),
        p("Landscape-07.jpg"),
        p("Landscape-08.jpg"),
        p("Landscape-09.jpg"),
        p("Landscape-10.jpg"),
        p("Landscape-11.jpg"),
        p("Landscape-13.jpg"),
        p("Landscape-14.jpg"),
        p("Landscape-15.jpg"),
        p("Landscape-16.jpg"),
        p("Landscape-17.jpg"),
        p("Landscape-18.jpg"),
        p("Landscape-19.jpg"),
        p("Landscape-20.jpg"),
        p("Landscape-21.jpg"),
        p("Landscape-22.jpg"),
        p("Landscape-24.jpg"),
        p("Landscape-25.jpg"),
        p("Landscape-26.jpg"),
        p("Landscape-27.jpg"),
        p("Landscape-28.jpg"),
        p("Landscape-29.jpg"),
        p("Landscape-32.jpg"),
        p("Landscape-33.jpg"),
        p("Landscape-34.jpg"),
        p("Landscape-35.jpg"),
        p("Landscape-36.jpg"),
        p("Landscape-37.jpg"),
        p("Landscape-38.jpg"),
        p("Landscape-39.jpg"),
      ],
    },

    journeys: {
      title: "Journeys",
      pageNo: 24,
      blurb: "Travel — roads, ranges and rooftops, from the Rockies to the Himalaya.",
      featured: ["Travel-01.jpg", "Travel-33.jpg", "Travel-43.jpg", "Travel-51.jpg"],
      photos: [
        p("Travel-01.jpg"),
        p("Travel-02.jpg"),
        p("Travel-03.jpg"),
        p("Travel-06.jpg"),
        p("Travel-07.jpg"),
        p("Travel-08.jpg"),
        p("Travel-09.jpg"),
        p("Travel-10.jpg"),
        p("Travel-11.jpg"),
        p("Travel-12.jpg"),
        p("Travel-13.jpg"),
        p("Travel-14.jpg"),
        p("Travel-15.jpg"),
        p("Travel-16.jpg"),
        p("Travel-17.jpg"),
        p("Travel-18.jpg"),
        p("Travel-19.jpg"),
        p("Travel-20.jpg"),
        p("Travel-21.jpg"),
        p("Travel-22.jpg"),
        p("Travel-23.jpg"),
        p("Travel-24.jpg"),
        p("Travel-25.jpg"),
        p("Travel-26.jpg"),
        p("Travel-27.jpg"),
        p("Travel-28.jpg"),
        p("Travel-29.jpg"),
        p("Travel-30.jpg"),
        p("Travel-31.jpg"),
        p("Travel-32.jpg"),
        p("Travel-33.jpg"),
        p("Travel-34.jpg"),
        p("Travel-35.jpg"),
        p("Travel-36.jpg"),
        p("Travel-37.jpg"),
        p("Travel-38.jpg"),
        p("Travel-39.jpg"),
        p("Travel-40.jpg"),
        p("Travel-41.jpg"),
        p("Travel-42.jpg"),
        p("Travel-43.jpg"),
        p("Travel-44.jpg"),
        p("Travel-45.jpg"),
        p("Travel-46.jpg"),
        p("Travel-47.jpg"),
        p("Travel-48.jpg"),
        p("Travel-49.jpg"),
        p("Travel-50.jpg"),
        p("Travel-51.jpg"),
        p("Travel-52.jpg"),
        p("Travel-53.jpg"),
        p("Travel-54.jpg"),
      ],
    },

    portraits: {
      title: "Good Company",
      pageNo: 36,
      blurb: "People — the ones who came along, and the ones I met on the way.",
      featured: ["Portrait-03.jpg", "Portrait-12.jpg", "Portrait-30.jpg", "Portrait-21.jpg"],
      photos: [
        p("Portrait-01.jpg"),
        p("Portrait-02.jpg"),
        p("Portrait-03.jpg"),
        p("Portrait-04.jpg"),
        p("Portrait-05.jpg"),
        p("Portrait-06.jpg"),
        p("Portrait-07.jpg"),
        p("Portrait-08.jpg"),
        p("Portrait-09.jpg"),
        p("Portrait-10.jpg"),
        p("Portrait-11.jpg"),
        p("Portrait-12.jpg"),
        p("Portrait-13.jpg"),
        p("Portrait-14.jpg"),
        p("Portrait-15.jpg"),
        p("Portrait-16.jpg"),
        p("Portrait-17.jpg"),
        p("Portrait-18.jpg"),
        p("Portrait-19.jpg"),
        p("Portrait-20.jpg"),
        p("Portrait-21.jpg"),
        p("Portrait-22.jpg"),
        p("Portrait-23.jpg"),
        p("Portrait-24.jpg"),
        p("Portrait-25.jpg"),
        p("Portrait-26.jpg"),
        p("Portrait-27.jpg"),
        p("Portrait-28.jpg"),
        p("Portrait-29.jpg"),
        p("Portrait-30.jpg"),
        p("Portrait-31.jpg"),
        p("Portrait-32.jpg"),
        p("Portrait-33.jpg"),
        p("Portrait-34.jpg"),
      ],
    },
  },

  about: {
    photo: {
      thumb: "photos/thumb/Banner-4.jpg",
      src:   "photos/full/Banner-4.jpg",
      caption: "somewhere with good signage",
      place: "",
      alt: "Chris Manning standing in front of a Chinatown restaurant, camera slung over an orange jacket",
    },
  },
};

/* ------------------------------------------------------------
   Generated: the pixel size of every thumb, measured with sips.
   The gallery uses these to reserve each photo's true shape
   before the jpeg arrives, so nothing reflows while it loads.
   Regenerate after adding photos — see README, "Adding photos".
   ------------------------------------------------------------ */
const THUMB_SIZES = {
  "Banner-4.jpg": [464, 700],
  "Landscape-01.jpg": [700, 472],
  "Landscape-02.jpg": [700, 472],
  "Landscape-03.jpg": [700, 472],
  "Landscape-04.jpg": [700, 472],
  "Landscape-05.jpg": [700, 466],
  "Landscape-06.jpg": [700, 466],
  "Landscape-07.jpg": [700, 466],
  "Landscape-08.jpg": [700, 466],
  "Landscape-09.jpg": [700, 466],
  "Landscape-10.jpg": [700, 466],
  "Landscape-11.jpg": [700, 466],
  "Landscape-13.jpg": [700, 466],
  "Landscape-14.jpg": [700, 466],
  "Landscape-15.jpg": [700, 466],
  "Landscape-16.jpg": [700, 466],
  "Landscape-17.jpg": [466, 700],
  "Landscape-18.jpg": [700, 466],
  "Landscape-19.jpg": [700, 466],
  "Landscape-20.jpg": [700, 466],
  "Landscape-21.jpg": [700, 466],
  "Landscape-22.jpg": [700, 466],
  "Landscape-24.jpg": [700, 466],
  "Landscape-25.jpg": [700, 466],
  "Landscape-26.jpg": [700, 466],
  "Landscape-27.jpg": [700, 447],
  "Landscape-28.jpg": [700, 466],
  "Landscape-29.jpg": [700, 466],
  "Landscape-32.jpg": [466, 700],
  "Landscape-33.jpg": [700, 466],
  "Landscape-34.jpg": [700, 250],
  "Landscape-35.jpg": [700, 466],
  "Landscape-36.jpg": [466, 700],
  "Landscape-37.jpg": [700, 466],
  "Landscape-38.jpg": [700, 466],
  "Landscape-39.jpg": [700, 466],
  "Portrait-01.jpg": [700, 525],
  "Portrait-02.jpg": [700, 436],
  "Portrait-03.jpg": [700, 466],
  "Portrait-04.jpg": [700, 466],
  "Portrait-05.jpg": [700, 466],
  "Portrait-06.jpg": [700, 466],
  "Portrait-07.jpg": [700, 466],
  "Portrait-08.jpg": [466, 700],
  "Portrait-09.jpg": [466, 700],
  "Portrait-10.jpg": [466, 700],
  "Portrait-11.jpg": [466, 700],
  "Portrait-12.jpg": [700, 466],
  "Portrait-13.jpg": [700, 466],
  "Portrait-14.jpg": [700, 466],
  "Portrait-15.jpg": [700, 466],
  "Portrait-16.jpg": [700, 466],
  "Portrait-17.jpg": [466, 700],
  "Portrait-18.jpg": [700, 471],
  "Portrait-19.jpg": [700, 466],
  "Portrait-20.jpg": [466, 700],
  "Portrait-21.jpg": [700, 466],
  "Portrait-22.jpg": [700, 466],
  "Portrait-23.jpg": [700, 466],
  "Portrait-24.jpg": [700, 466],
  "Portrait-25.jpg": [466, 700],
  "Portrait-26.jpg": [700, 466],
  "Portrait-27.jpg": [700, 466],
  "Portrait-28.jpg": [468, 700],
  "Portrait-29.jpg": [525, 700],
  "Portrait-30.jpg": [700, 466],
  "Portrait-31.jpg": [700, 466],
  "Portrait-32.jpg": [700, 466],
  "Portrait-33.jpg": [700, 466],
  "Portrait-34.jpg": [700, 466],
  "Travel-01.jpg": [700, 525],
  "Travel-02.jpg": [700, 525],
  "Travel-03.jpg": [472, 700],
  "Travel-06.jpg": [466, 700],
  "Travel-07.jpg": [466, 700],
  "Travel-08.jpg": [700, 466],
  "Travel-09.jpg": [700, 466],
  "Travel-10.jpg": [700, 466],
  "Travel-11.jpg": [700, 466],
  "Travel-12.jpg": [700, 466],
  "Travel-13.jpg": [700, 466],
  "Travel-14.jpg": [475, 700],
  "Travel-15.jpg": [700, 466],
  "Travel-16.jpg": [700, 466],
  "Travel-17.jpg": [466, 700],
  "Travel-18.jpg": [700, 472],
  "Travel-19.jpg": [700, 472],
  "Travel-20.jpg": [700, 472],
  "Travel-21.jpg": [700, 472],
  "Travel-22.jpg": [700, 466],
  "Travel-23.jpg": [700, 466],
  "Travel-24.jpg": [700, 466],
  "Travel-25.jpg": [466, 700],
  "Travel-26.jpg": [700, 466],
  "Travel-27.jpg": [466, 700],
  "Travel-28.jpg": [466, 700],
  "Travel-29.jpg": [700, 466],
  "Travel-30.jpg": [700, 466],
  "Travel-31.jpg": [466, 700],
  "Travel-32.jpg": [700, 466],
  "Travel-33.jpg": [700, 466],
  "Travel-34.jpg": [700, 466],
  "Travel-35.jpg": [466, 700],
  "Travel-36.jpg": [700, 466],
  "Travel-37.jpg": [700, 466],
  "Travel-38.jpg": [466, 700],
  "Travel-39.jpg": [466, 700],
  "Travel-40.jpg": [700, 466],
  "Travel-41.jpg": [466, 700],
  "Travel-42.jpg": [700, 466],
  "Travel-43.jpg": [700, 466],
  "Travel-44.jpg": [700, 679],
  "Travel-45.jpg": [700, 466],
  "Travel-46.jpg": [700, 348],
  "Travel-47.jpg": [700, 466],
  "Travel-48.jpg": [700, 287],
  "Travel-49.jpg": [700, 466],
  "Travel-50.jpg": [466, 700],
  "Travel-51.jpg": [700, 466],
  "Travel-52.jpg": [700, 466],
  "Travel-53.jpg": [525, 700],
  "Travel-54.jpg": [700, 466],
};

for (const col of Object.values(SITE.collections)) {
  for (const ph of col.photos) {
    const d = THUMB_SIZES[ph.thumb.split("/").pop()];
    if (d) ph.ar = d[0] / d[1];
  }
}
