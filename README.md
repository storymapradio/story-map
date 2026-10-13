# Story Map

Burton's Arabian Nights and six more public-domain compendiums, mapped by the journeys the tales make. Open a place, read a passage aloud, and your voice fixes to those sentences, kept on your own device.

**Play it:** https://storymapradio.github.io/story-map/

**The instrument as it lives on the site:** https://asynchronousinstruments.com/storymap

&nbsp;

The Story Map is a map of the Arabian Nights drawn from the journeys the tales make.

Every filled hexagon is a place a story passes through, and the routes between them are the roads its characters travel. The world turns as a globe seen at an isometric tilt. Come close and each city opens into a tile map of its own, with the bazar, the hammam, the palace and the quay standing where the tales go, and every model on the ground answers when you touch it.

Tap a filled cell to meet the tales that travel through it, open one, and read it aloud.

&nbsp;

## The compendiums

The map carries 526 tales from seven public-domain books. Each one is cut into tales, each tale into sentences, and each sentence is placed where it happens.

- **A Thousand Nights and a Night**, Richard F. Burton, 1885. 216 tales from Morocco to Sumatra, cut from the edition kept at https://www.burtoniana.org/
- **Myths of the Cherokee**, James Mooney, 1900. 105 tales of the southern Appalachians, from Project Gutenberg: https://www.gutenberg.org/ebooks/45634
- **The Decameron**, Giovanni Boccaccio, in J. M. Rigg's translation of 1903. 100 tales of Florence and the Mediterranean: https://www.gutenberg.org/ebooks/23700
- **Zuñi Folk Tales**, Frank Hamilton Cushing, 1901. 34 tales of the Zuñi country in New Mexico: https://www.gutenberg.org/ebooks/54682
- **The Odyssey**, Homer, in Samuel Butler's prose of 1900. 24 books from Ithaca across the western sea: https://www.gutenberg.org/ebooks/1727
- **Hawaiian Legends of Volcanoes**, W. D. Westervelt, 1916. 24 tales of the island of Hawaii: https://www.gutenberg.org/ebooks/66516
- **Legends of Old Honolulu**, W. D. Westervelt, 1915. 23 tales of Oahu: https://www.gutenberg.org/ebooks/66547

The coastlines, lakes and rivers come from Natural Earth, which is in the public domain. Each tale links to its source, so you can always read it where it was first printed.

&nbsp;

## Reading aloud

Choose a passage by dragging across the text, or let the map hand you the next part waiting to be read. Press record and read. While you read, the line you are on lights up and the words your browser hears are written beneath it.

When you stop, your voice is fixed to exactly those sentences: the first and the last, the timing of every word, and the transcript. Play it back and the text follows your voice line by line, the scene on its hexagon turning to each place the sentence names. A ring on the map marks every place you have read aloud into, and the library holds every tale that carries your voice, ready to pick up where you left off.

The teleprompter moves the text for you as you read. Focus mode sets the scene on its hexagon with the lines moving above it.

&nbsp;

## On one device

Everything you see here works on your own device: the globe and the cities, the seven books, reading, recording, listening back, the library, and deleting a reading. Your readings are kept in this browser, and they are there each time you return.

The words under your lines come from your browser's own speech recognition. Where the browser holds an on-device speech model, the Story Map uses it and the sound stays on your machine. Where it does not, the browser sends the sound to its maker's recognizer to write the words, and the recording itself stays here.

On asynchronousinstruments.com the Story Map is shared. Every reading joins one map that anyone can hear, so a passage can carry many voices at once, and the story matrix in the Engine files your readings under Sylvester's fifteen headings. Those belong to the site, and you can join them there at https://asynchronousinstruments.com/storymap

&nbsp;

## Run it yourself

Open the link above, or serve this folder from any static file server and open `index.html`:

```
npx serve .
```

The microphone needs the page to come from `https://` or `localhost`, so opening the file straight from disk works only for reading and listening.

&nbsp;

## How this version works

This is the same code as the instrument on asynchronousinstruments.com, published from that project as the instrument grows. Where the site keeps what people make in a shared database, this version keeps it in your own browser: `local/local-supabase.js` answers the same calls from IndexedDB on your device, and `local/local.js` holds the few things this instrument needs from it.

There is no login, no account and no server. This page uploads nothing you record or write: it all stays in this browser, and clearing this site's data in your browser clears it.

&nbsp;

## Where it comes from

Made by Aaron Goldstein at Asynchronous Instruments, https://asynchronousinstruments.com. This repository is written by the build in the main project (`storymapradio/open`), so changes made here directly are replaced at the next publication. Issues and ideas are welcome.

&nbsp;

## License

MIT. See `LICENSE`.
