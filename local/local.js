/* The Story Map keeps each reading as one row in nights_readings (the tale, the first and last sentence read, the
   timing of the words, the transcript) and its sound as one file in the nights-readings bucket. On the site the
   database names the reader; here the reader is the one person on this device. */
LocalSupabase.configure({
  name: 'story-map',
  you: { display_name: 'You' },
  defaults: { nights_readings: { user_id: '$uid', reader_name: 'You' } }
});
