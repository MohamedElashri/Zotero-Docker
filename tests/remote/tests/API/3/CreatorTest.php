<?php
/*
    ***** BEGIN LICENSE BLOCK *****
    
    This file is part of the Zotero Data Server.
    
    Copyright © 2013 Center for History and New Media
                     George Mason University, Fairfax, Virginia, USA
                     http://zotero.org
    
    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.
    
    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.
    
    You should have received a copy of the GNU Affero General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
    
    ***** END LICENSE BLOCK *****
*/

namespace APIv3;
use API3 as API;
require_once 'APITests.inc.php';
require_once 'include/api3.inc.php';

class CreatorTests extends APITests {
	public static function setUpBeforeClass(): void {
		parent::setUpBeforeClass();
		API::userClear(self::$config['userID']);
	}
	
	public static function tearDownAfterClass(): void {
		parent::tearDownAfterClass();
		API::userClear(self::$config['userID']);
	}
	
	
	public function test_should_add_creator_with_correct_case() {
		// Create two items with lowercase
		$data = [
			"creators" => [
				[
					"creatorType" => "author",
					"name" => "test"
				]
			]
		];
		API::createItem("book", $data);
		API::createItem("book", $data);
		
		// Create capitalized
		$json = API::createItem("book", [
			"creators" => [
				[
					"creatorType" => "author",
					"name" => "Test"
				]
			]
		], $this, 'json');
		$itemKey = $json['key'];
		
		$this->assertEquals("Test", $json['data']['creators'][0]['name']);
	}
	
	
	public function testCreatorSummaryJSON() {
		$json = API::createItem("book", array(
			"creators" => array(
				array(
					"creatorType" => "author",
					"name" => "Test"
				)
			)
		), $this, 'json');
		$itemKey = $json['key'];
		
		$this->assertEquals("Test", $json['meta']['creatorSummary']);
		
		$json = $json['data'];
		$json['creators'][] = [
			"creatorType" => "author",
			"firstName" => "Alice",
			"lastName" => "Foo"
		];
		
		$response = API::userPut(
			self::$config['userID'],
			"items/$itemKey",
			json_encode($json)
		);
		$this->assert204($response);
		
		$json = API::getItem($itemKey, $this, 'json');
		$this->assertEquals("Test and Foo", $json['meta']['creatorSummary']);
		
		$json = $json['data'];
		$json['creators'][] = array(
			"creatorType" => "author",
			"firstName" => "Bob",
			"lastName" => "Bar"
		);
		
		$response = API::userPut(
			self::$config['userID'],
			"items/$itemKey",
			json_encode($json)
		);
		$this->assert204($response);
		
		$json = API::getItem($itemKey, $this, 'json');
		$this->assertEquals("Test et al.", $json['meta']['creatorSummary']);
	}
	
	
	public function testCreatorSummaryAtom() {
		$xml = API::createItem("book", array(
			"creators" => array(
				array(
					"creatorType" => "author",
					"name" => "Test"
				)
			)
		), $this, 'atom');
		$data = API::parseDataFromAtomEntry($xml);
		$itemKey = $data['key'];
		$json = json_decode($data['content'], true);
		
		$creatorSummary = (string) array_get_first($xml->xpath('//atom:entry/zapi:creatorSummary'));
		$this->assertEquals("Test", $creatorSummary);
		
		$json['creators'][] = array(
			"creatorType" => "author",
			"firstName" => "Alice",
			"lastName" => "Foo"
		);
		
		$response = API::userPut(
			self::$config['userID'],
			"items/$itemKey",
			json_encode($json)
		);
		$this->assert204($response);
		
		$xml = API::getItemXML($itemKey);
		$creatorSummary = (string) array_get_first($xml->xpath('//atom:entry/zapi:creatorSummary'));
		$this->assertEquals("Test and Foo", $creatorSummary);
		
		$data = API::parseDataFromAtomEntry($xml);
		$json = json_decode($data['content'], true);
		
		$json['creators'][] = array(
			"creatorType" => "author",
			"firstName" => "Bob",
			"lastName" => "Bar"
		);
		
		$response = API::userPut(
			self::$config['userID'],
			"items/$itemKey",
			json_encode($json)
		);
		$this->assert204($response);
		
		$xml = API::getItemXML($itemKey);
		$creatorSummary = (string) array_get_first($xml->xpath('//atom:entry/zapi:creatorSummary'));
		$this->assertEquals("Test et al.", $creatorSummary);
	}
	
	
	public function testEmptyCreator() {
		$json = API::createItem("book", array(
			"creators" => array(
				array(
					"creatorType" => "author",
					"name" => chr(0xEF) . chr(0xBB) . chr(0xBF)
				)
			)
		), $this, 'json');
		$this->assertArrayNotHasKey('creatorSummary', $json['meta']);
	}
	
	
	public function testCreatorCaseSensitivity() {
		API::createItem("book", array(
			"creators" => array(
				array(
					"creatorType" => "author",
					"name" => "SMITH"
				)
			)
		), $this, 'json');
		$json = API::createItem("book", array(
			"creators" => array(
				array(
					"creatorType" => "author",
					"name" => "Smith"
				)
			)
		), $this, 'json');
		$this->assertEquals('Smith', $json['data']['creators'][0]['name']);
	}
	
	
	public function test_should_allow_emoji_in_creator_name() {
		$char = "🐻"; // 4-byte character
		$json = API::createItem("book", [
			"creators" => [
				[
					"creatorType" => "author",
					"name" => $char
				]
			]
		], $this, 'json');
		$this->assertEquals($char, $json['data']['creators'][0]['name']);
	}
}
