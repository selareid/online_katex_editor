use std::io::prelude::*;
use std::net::TcpListener;
use std::net::TcpStream;
use std::str;
use std::io::{BufRead, BufReader, Lines, Take};
use std::collections::HashMap;

fn get_note_name(uri: &str) -> Result<String, &str> {
    if uri.len() <= 1 || uri.contains(|c: char| !c.is_ascii_alphanumeric()) {
        return Err("Invalid Note Name");
    }
    else {
        return Ok(String::from(&uri[1..]));
    }
}

fn main() {
    let mut notes_map: HashMap<String, String> = Default::default();

    notes_map.insert(String::from("ohio_katex"), r"❤️{\Huge \text{OHIO GAMERS!!}}\\\text{you are a susssy baka}".parse().unwrap());

    let listener = TcpListener::bind("127.0.0.1:7878").unwrap();

    println!("listening!");

    for stream in listener.incoming() {
        let stream = stream.unwrap();
        handle_connection(stream, &mut notes_map);
    }
}

fn handle_connection(mut stream: TcpStream, notes_map: &mut HashMap<String, String>) {
    let mut reader = BufReader::new(&stream);

    let mut lines = reader.by_ref().lines();
    let first_line = lines.next().unwrap().unwrap();
    let first_line_vec = first_line.split_whitespace().collect::<Vec<&str>>();
    let uri: &str = *first_line_vec.get(1).unwrap();

    match first_line_vec.get(0) {
        Some(request_type) => {
            match request_type {
                &"GET" => {handle_get_request(uri, stream, notes_map)}
                &"POST" => {
                    println!("New Request for {}", uri);

                    let mut data_length: u64 = get_data_length_of_posted_content(&mut lines);
                    let mut take = reader.take(data_length);
                    let data_string = get_request_data(&mut take);
                    let (reply_code, reply_contents) = attempt_store_note(notes_map, uri, data_string);

                    let response = format!(
                        "{}\r\nContent-Length: {}\r\n\r\n{}",
                        reply_code,
                        reply_contents.len(),
                        reply_contents
                    );

                    println!("returning {}", reply_contents);

                    stream.write(response.as_bytes()).unwrap();
                    stream.flush().unwrap();
                }
                _ => {println!("Bad request type {}", request_type);}
            }
        }
        None => {panic!("Woah, first_line of http request is empty :o")}
    }
}

fn attempt_store_note(notes_map: &mut HashMap<String, String>, uri: &str, data_string: String) -> (String, String) {
    match get_note_name(uri) {
        Ok(note_name) => {
            notes_map.insert(note_name, data_string);
            (format!("HTTP/1.1 200 OK"), format!("Seems to be inserted"))
        }
        Err(err) => {
            (format!("HTTP/1.1 400 BAD REQUEST"), String::from(err))
        }
    }
}

fn get_request_data(mut take: &mut Take<BufReader<&TcpStream>>) -> String {
    let mut data_string = String::new();

    let mut buffers: Vec<[u8; 32]> = add_to_buffer(&mut take);
    println!("Buffers {:?}", buffers);
    buffers.iter().for_each(|buf| buf.iter().filter(|c| *c != &0_u8).for_each(|c| data_string.push(char::from(*c))));

    return data_string;
}

fn add_to_buffer(take: &mut Take<BufReader<&TcpStream>>) -> Vec<[u8; 32]>{
    let mut buffers = Vec::new();

    let mut stop = false;
    while !stop {
        let mut buf = [0; 32];
        take.read(&mut buf);
        println!("{}", String::from_utf8_lossy(&buf));
        stop = buf[buf.len() - 1] == 0;

        buffers.push(buf);
    }

    return buffers;
}

fn get_data_length_of_posted_content(lines: &mut Lines<&mut BufReader<&TcpStream>>) -> u64 {
    let mut data_length: u64 = 0;

    for line in lines {
        let request_content = line.unwrap();
        println!("Request: {:?}", request_content);

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

fn handle_get_request(uri: &str, mut stream: TcpStream, notes_map: &HashMap<String, String>) {
    let (status_line, contents) = get_return_data_for_get_request(uri, notes_map);

    let response = format!(
        "{}\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Length: {}\r\n\r\n{}",
        status_line,
        contents.len(),
        contents
    );

    stream.write(response.as_bytes()).unwrap();
    stream.flush().unwrap();
}

fn get_return_data_for_get_request(uri: &str, notes_map: &HashMap<String, String>) -> (String, String) {
    match get_note_name(uri) {
        Ok(note_name) => {
            match notes_map.get(&note_name) {
                None => (String::from("HTTP/1.1 404 NOT FOUND"), format!("Blank Note: {}", note_name)),
                Some(note_data) => (String::from("HTTP/1.1 200 OK"), format!("{}", note_data.clone())),
            }
        }
        Err(err) => (String::from("HTTP/1.1 400 BAD REQUEST"), String::from(err)),
    }
}