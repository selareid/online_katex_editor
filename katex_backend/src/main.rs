use std::io::prelude::*;
use std::net::TcpListener;
use std::net::TcpStream;
use std::{fs, str};
use std::io::{BufRead, BufReader, Lines, Take};
use std::collections::HashMap;
use fs::File;
use std::error::Error;

const MAX_NOTE_LENGTH: u64 = 10000000;
const MAX_NOTES: usize = 99;
const SPECIAL_NOTE_PREFIX: &str = "test_special_note_";
const RESERVED_NOTE_NAMES: [&str; 2] = ["macros", "notes_list"];

enum URIType {
    NotesList,
    Macros,
    Note(String),
    Err
}

struct NoteStore {
    notes_path: &'static str,
    notes_map: HashMap<String, String>
}

impl NoteStore {
    fn new(notes_path: &'static str) -> Self {
        println!("Checking directory {} exists: {:?}", notes_path,
                 match fs::create_dir_all(notes_path) {
                     Ok(_) => "Success!".to_string(),
                     Err(err) => err.to_string(),
                 });

        let mut note_store = NoteStore { notes_path, notes_map: Default::default() };

        // force caching of all notes in directory
        for note_name in NoteStore::get_notes_in_directory(notes_path) {
            note_store.get_note(&note_name);
        }

        note_store
    }

    fn get_notes_in_directory(path_str: &'static str) -> Vec<String> {
        let paths = fs::read_dir(path_str).unwrap();
        let mut file_names: Vec<String> = Default::default();

        for path in paths {
            let os_string = path.as_ref().unwrap().file_name();

            if let Ok(file_name) = os_string.into_string() {
                file_names.push(file_name);
            }
            else {
                println!("ERROR: couldn't convert os_string to string for path {:?}", path);
            }
        }

        file_names
    }

    fn get_path_for_note(&self, note_name: &String) -> String {
        format!("{}{}", self.notes_path, note_name)
    }

    fn store_note(&mut self, note_name: &String, data: String) -> Result<String, Box<dyn Error>> {
        if self.notes_map.len() >= MAX_NOTES {
            return Err("Max Number of Notes Reached")?;
        }

        let mut output = File::create(self.get_path_for_note(note_name))?;
        write!(output, "{}", data)?;

        self.notes_map.insert(String::clone(note_name), data); //update cache notes_map
        Ok(format!("SUCCESS!"))
    }

    fn get_note(&mut self, note_name: &String) -> Result<String, Box<dyn Error>> {
        match self.notes_map.get(note_name) {
            None => { //not in notes_map, get from file
                let mut file = File::open(self.get_path_for_note(note_name))?;
                let mut buffer = String::new();
                file.read_to_string(&mut buffer)?; //if unavailable returns error

                self.notes_map.insert(String::clone(note_name), String::clone(&buffer)); //cache in notes_map
                Ok(buffer)
            },
            Some(note_data) => Ok(String::clone(note_data)),
        }
    }

    fn attempt_store_note_for_request(&mut self, note_name: &String, data: String) -> (String, String) {
        if RESERVED_NOTE_NAMES.contains(&note_name.as_str()) || is_special_note(note_name) {
            return (format!("HTTP/1.1 401 Unauthorized"), format!("You're not allowed to edit note {}", &note_name));
        }

        match self.store_note(note_name, data) {
            Ok(_) => (format!("HTTP/1.1 200 OK"), format!("Seems to be inserted")),
            Err(err) => (format!("HTTP/1.1 500 INTERNAL SERVER ERROR"), err.to_string()),
        }
    }

    fn attempt_get_note_for_request(&mut self, note_name: &String) -> (String, String) {
        match self.get_note(&note_name) {
            Err(err) => (String::from("HTTP/1.1 404 NOT FOUND"), err.to_string()),
            Ok(note_data) => (String::from("HTTP/1.1 200 OK"), format!("{}", note_data.clone())),
        }
    }

    fn handle_special_note_get(&mut self, stripped_note_name: &str) -> (String, String) {
        match stripped_note_name {
            "macros" => self.attempt_get_note_for_request(&String::from(stripped_note_name)),
            "notes_list" => (String::from("HTTP/1.1 200 OK"),
                             format!("\\text{{Notes List}}:\n{}", self.notes_map.keys().map(|s| String::clone(s)).map(|s| format!{"\\\\\\text{{{}}}", s}).reduce(|a, b| format!("{}\n{}", a, b)).unwrap_or("".to_string()))),
            &_ => (String::from("HTTP/1.1 404 NOT FOUND"), format!("Couldn't find special note {}", stripped_note_name)),
        }
    }
}

fn get_note_name(uri: &str) -> Result<String, &str> {
    return if uri.len() <= 1 || String::from(&uri[1..]).contains(|c: char| !c.is_ascii_alphanumeric() && c != '_') {
        Err("Invalid Note Name")
    } else {
        Ok(String::from(&uri[1..]))
    }
}

fn main() {
    let mut note_store: NoteStore = NoteStore::new("notes_store/");

    let listener = TcpListener::bind("127.0.0.1:7878").unwrap();

    println!("Listening on {}", listener.local_addr().unwrap());

    for stream in listener.incoming() {
        let stream = stream.unwrap();
        handle_connection(stream, &mut note_store);
    }
}

fn handle_connection(mut stream: TcpStream, note_store: &mut NoteStore) {
    let mut reader = BufReader::with_capacity(MAX_NOTE_LENGTH as usize + 1000, &stream);

    let mut lines = reader.by_ref().lines();
    let first_line = lines.next().unwrap().unwrap();
    let first_line_vec = first_line.split_whitespace().collect::<Vec<&str>>();
    let uri_type: URIType = get_uri_type(*first_line_vec.get(1).unwrap());

    match first_line_vec.get(0) {
        Some(request_type) => {
            match request_type {
                &"GET" => {
                    match uri_type {
                        URIType::NotesList => todo!(),
                        URIType::Macros => todo!(),
                        URIType::Note(uri) => {handle_get_request(&uri, stream, note_store);},
                        URIType::Err => todo!(),
                    }
                }
                &"POST" => {
                    match uri_type {
                        URIType::NotesList => todo!(),
                        URIType::Macros => todo!(),
                        URIType::Note(uri) => {
                            let data_length = get_data_length_of_posted_content(&mut lines);

                            let response = handle_post_request(&uri, reader, data_length, note_store);

                            stream.write(response.as_bytes()).unwrap();
                            stream.flush().unwrap();
                        },
                        URIType::Err => todo!(),
                    }
                }
                _ => {println!("Bad request type {}", request_type);}
            }
        }
        None => {panic!("Woah, first_line of http request is empty :o")}
    }
}

//map uri to URIType enum variant
fn get_uri_type(uri: &str) -> URIType {
    let split_uri: Vec<String> = uri.split('/').map(|s| String::from(s)).collect::<Vec<_>>();
    let mut split_uri_iter = split_uri.iter();

    split_uri_iter.next(); // we don't care about the stuff before the first / (it's blank)

    let first_part_of_uri = split_uri_iter.next().unwrap();

    match first_part_of_uri.as_str() {
        "notes_list" => URIType::NotesList,
        "macros" => URIType::Macros,
        "notes" => {
            URIType::Note(String::from(split_uri_iter.next().unwrap()))
        },
        _ => URIType::Err,
    }
}

fn handle_post_request(uri: &str, reader: BufReader<&TcpStream>, data_length: u64, note_store: &mut NoteStore) -> String {
    println!("New POST request for {}", uri);

    let response: String = if data_length > MAX_NOTE_LENGTH {
        let status = String::from("HTTP/1.1 413 NOTE SIZE TOO LARGE");
        let contents = format!("Note Length: {}, Max Length: {}", data_length, MAX_NOTE_LENGTH);

        format!("{}\r\nContent-Length: {}\r\n\r\n{}",
                status,
                contents.len(),
                contents
        )
    } else {
        let mut take = reader.take(data_length);
        let data_string = get_request_data(&mut take);

        let (reply_code, reply_contents): (String, String) = match get_note_name(uri) {
            Ok(note_name) => note_store.attempt_store_note_for_request(&note_name, data_string),
            Err(err) => (format!("HTTP/1.1 400 BAD REQUEST"), String::from(err)),
        };


        println!(" Replying {}", reply_contents);

        format!(
            "{}\r\nContent-Length: {}\r\n\r\n{}",
            reply_code,
            reply_contents.len(),
            reply_contents
        )
    };

    return response;
}

fn get_request_data(mut take: &mut Take<BufReader<&TcpStream>>) -> String {
    let mut data_string = String::new();

    let buffers: Vec<[u8; 32]> = add_to_buffer(&mut take);

    buffers.iter().for_each(|buf| buf.iter().filter(|c| *c != &0_u8).for_each(|c| data_string.push(char::from(*c))));

    return data_string;
}

fn add_to_buffer(take: &mut Take<BufReader<&TcpStream>>) -> Vec<[u8; 32]>{
    let mut buffers = Vec::new();

    let mut stop = false;
    while !stop {
        let mut buf = [0; 32];
        take.read(&mut buf);

        stop = buf[buf.len() - 1] == 0;

        buffers.push(buf);
    }

    return buffers;
}

fn get_data_length_of_posted_content(lines: &mut Lines<&mut BufReader<&TcpStream>>) -> u64 {
    let mut data_length: u64 = 0;

    for line in lines {
        let request_content = line.unwrap();

        if request_content.contains("Content-Length") {
            let mut split_content = request_content.split_whitespace();
            split_content.next();
            let length = split_content.next().unwrap();
            data_length = str::parse(length).unwrap();
        }

        if request_content == "" { break; }
    }

    return data_length;
}

fn handle_get_request(uri: &str, mut stream: TcpStream, note_store: &mut NoteStore) {
    let (status_line, contents) = get_return_data_for_get_request(uri, note_store);

    let response = format!(
        "{}\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Length: {}\r\n\r\n{}",
        status_line,
        contents.len(),
        contents
    );

    stream.write(response.as_bytes()).unwrap();
    stream.flush().unwrap();
}

fn get_return_data_for_get_request(uri: &str, note_store: &mut NoteStore) -> (String, String) {
    match get_note_name(uri) {
        Ok(note_name) => {
            if is_special_note(&note_name) {
                let stripped_note_name: &str = &note_name[SPECIAL_NOTE_PREFIX.len()..]; //note_name without SPECIAL_NOTE_PREFIX
                note_store.handle_special_note_get(stripped_note_name)
            }
            else {
                // Handle regular note
                note_store.attempt_get_note_for_request(&note_name)
            }
        }
        Err(err) => (String::from("HTTP/1.1 400 BAD REQUEST"), String::from(err)),
    }
}

fn is_special_note(note_name: &String) -> bool {
    //checks that note_name starts with SPECIAL_NOTE_PREFIX
    note_name.len() >= SPECIAL_NOTE_PREFIX.len() && &note_name[..SPECIAL_NOTE_PREFIX.len()] == SPECIAL_NOTE_PREFIX
}