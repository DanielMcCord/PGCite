use std::borrow::Cow;
use std::fmt::{Debug, Display, Formatter};

use lazy_static::lazy_static;
use mediawiki::Api;
use nade::base::nade_helper;
use nade::nade;
use regex::Regex;
use serde_json::value::Value;
use url::{ParseError, Url};

/// https://stackoverflow.com/questions/29601839/standard-regex-to-prevent-sparql-injection/55726984#55726984
fn escape_sparql(str: &str) -> Cow<str> {
  lazy_static! {
    static ref SPARQL_METACHARACTERS: Regex = Regex::new(r#"(["'\\])"#).unwrap();
  }
  SPARQL_METACHARACTERS.replace_all(str, r"\$1")
}

/// Make a request to the Wikidata SPARQL API, using a given SPARQL query (as it would be entered in https://query.wikidata.org/)
async fn make_request(query: &str) -> Vec<Value> {
  let query_with_prefixes = format!(
    "
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX p: <http://www.wikidata.org/prop/>
PREFIX ps: <http://www.wikidata.org/prop/statement/>
PREFIX bd: <http://www.bigdata.com/rdf#>
{query}"
  );

  Api::new("https://www.wikidata.org/w/api.php")
    .await
    .unwrap()
    .sparql_query(&query_with_prefixes)
    .await
    .unwrap()
    .as_object()
    .unwrap()
    .get("results")
    .unwrap()
    .get("bindings")
    .unwrap()
    .as_array()
    .unwrap()
    .clone()
}

struct Person {
  /// Ex. Douglas Adams
  name: String,
  /// Ex. English author and humourist (1952–2001)
  description: String,
  /// Ex. Q42
  id: String,
  /// Ex. https://www.wikidata.org/entity/Q42
  id_url: Url,
}

impl Person {
  fn new(name: &str, description: &str, id: Url) -> Result<Self, ParseError> {
    Ok(Person {
      name: name.into(),
      description: description.into(),
      id: get_last_segment(&id),
      id_url: id,
    })
  }
}

impl Debug for Person {
  fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
    write!(f, "{}: {} ({})", self.id, self.name, self.description)
  }
}

async fn get_authors(name: &str) -> Vec<Person> {
  let query = format!(
    "
SELECT
  ?id          # Ex. Q42
  ?name        # Ex. Douglas Adams
  ?description # Ex. English author and humourist (1952–2001)
WHERE {{
  VALUES ?name {{
    \"\"\"{escaped_name}\"\"\"@en
  }}

  ?id wdt:P31 wd:Q5;                 # The ID of an instance of human,
    rdfs:label ?name;                # ...whose entity label matches ?name,
    schema:description ?description. # ...and get their single-sentence entity description

  FILTER((LANG(?name)) = \"en\")        # Only names in English
  FILTER((LANG(?description)) = \"en\") # Only descriptions in English
}}
",
    escaped_name = escape_sparql(name)
  );

  make_request(&query)
    .await
    .iter()
    .map(|v| {
      let [name, description, id_url] = get_values(v, ["name", "description", "id"]);
      Person::new(name, description, Url::parse(id_url).unwrap()).unwrap()
    })
    .collect()
}

struct Field {
  /// Ex. novelist
  value: String,
  /// Ex. occupation
  label: String,
  /// Ex. P106
  label_id: String,
  /// Ex. https://www.wikidata.org/prop/direct/P106
  label_id_url: Url,
}

impl Field {
  fn new(label_id_url: &str, label: &str, value: &str) -> Result<Field, ParseError> {
    let label_id_url = Url::parse(label_id_url)?;
    Ok(Field {
      value: value.into(),
      label: label.into(),
      label_id: get_last_segment(&label_id_url),
      label_id_url,
    })
  }
}

impl Debug for Field {
  fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
    write!(f, "{}: {}", self.label, self.value)
  }
}

/// Get the last part of the path of a URL
fn get_last_segment(url: &Url) -> String {
  url.path_segments().and_then(|s| s.last()).unwrap().into()
}

struct Q<'a>(&'a str);

impl Display for Q<'_> {
  fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
    write!(f, "Q{}", self.0)
  }
}

/// Get information about a given author, using an exact ID (ex. Q42)
/// onlyWikidataEntities filters results to only those with Wikidata entries (not literal values)
#[nade]
async fn get_author_info(id: Q<'_>, #[nade(true)] only_wikidata_entities: bool) -> Vec<Field> {
  let query = format!(
    "
SELECT DISTINCT
  ?propID     # Ex. P734
  ?propLabel  # Ex. family name
  ?value      # Ex. Q351735
  ?valueLabel # Ex. Adams
WHERE {{
  VALUES ?target {{
    wd:{id}
  }}

  ?target ?propID ?value.

  ?prop wikibase:directClaim ?propID.

  # Filters results to only those with Wikidata entries
  # Ex. Q84 but not douglasadams
  {comment_marker} FILTER(CONTAINS(STR(?value), \"/entity/Q\"))

  # Fetches the label for every ?variable, the result of which is stored in ?variableLabel
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language \"[AUTO_LANGUAGE],en\". }}
}}
ORDER BY DESC(?propID) # Doesn't actually sort correctly because props aren't 0-padded",
    comment_marker = if only_wikidata_entities { "#" } else { "" }
  );

  make_request(&query)
    .await
    .iter()
    .map(|v| {
      let [label_id, label, value] = get_values(v, ["propID", "propLabel", "valueLabel"]);
      Field::new(label_id, label, value).unwrap()
    })
    .collect()
}

/// Get a list of values for the given binding names
fn get_values<'a, const N: usize>(obj: &'a Value, names: [&str; N]) -> [&'a str; N] {
  names.map(|name| {
    obj
      .as_object()
      .unwrap()
      .get(name)
      .unwrap()
      .get("value")
      .unwrap()
      .as_str()
      .unwrap()
  })
}

#[tokio::main]
async fn main() {
  let authors = get_authors("William Carpenter").await;
  for author in authors {
    println!("{author:?}");
  }

  println!();

  for field in get_author_info!(Q("8006577")).await {
    println!("{field:?}");
  }
}
