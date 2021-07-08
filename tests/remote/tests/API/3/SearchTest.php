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

class SearchTests extends APITests {
	public static function setUpBeforeClass(): void {
		parent::setUpBeforeClass();
		API::userClear(self::$config['userID']);
	}
	
	public static function tearDownAfterClass(): void {
		parent::tearDownAfterClass();
		API::userClear(self::$config['userID']);
	}
	
	
	public function testNewSearch() {
		$name = "Test Search";
		$conditions = [
			[
				"condition" => "title",
				"operator" => "contains",
				"value" => "test"
			],
			[
				"condition" => "noChildren",
				"operator" => "false",
				"value" => ""
			],
			[
				"condition" => "fulltextContent/regexp",
				"operator" => "contains",
				"value" => "/test/"
			]
		];
		
		// DEBUG: Should fail with no version?
		$response = API::userPost(
			self::$config['userID'],
			"searches",
			json_encode([[
				"name" => $name,
				"conditions" => $conditions
			]]),
			["Content-Type: application/json"]
		);
		$this->assert200($response);
		$libraryVersion = $response->getHeader("Last-Modified-Version");
		$json = API::getJSONFromResponse($response);
		$this->assertCount(1, $json['successful']);
		// Deprecated
		$this->assertCount(1, $json['success']);
		
		// Check data in write response
		$data = $json['successful'][0]['data'];
		$this->assertEquals($json['successful'][0]['key'], $data['key']);
		$this->assertEquals($libraryVersion, $data['version']);
		$this->assertEquals($libraryVersion, $data['version']);
		$this->assertEquals($name, $data['name']);
		$this->assertIsArray($data['conditions']);
		$this->assertCount(sizeOf($conditions), $data['conditions']);
		foreach ($conditions as $i => $condition) {
			foreach ($condition as $key => $val) {
				$this->assertEquals($val, $data['conditions'][$i][$key]);
			}
		}
		
		
		// Check in separate request, to be safe
		$keys = array_map(function ($o) {
			return $o['key'];
		}, $json['successful']);
		$response = API::getSearchResponse($keys);
		$this->assertTotalResults(1, $response);
		$json = API::getJSONFromResponse($response);
		$data = $json[0]['data'];
		$this->assertEquals($name, $data['name']);
		$this->assertIsArray($data['conditions']);
		$this->assertCount(sizeOf($conditions), $data['conditions']);
		foreach ($conditions as $i => $condition) {
			foreach ($condition as $key => $val) {
				$this->assertEquals($val, $data['conditions'][$i][$key]);
			}
		}
		
		return $data;
	}
	
	
	/**
	 * @depends testNewSearch
	 */
	public function testModifySearch($data) {
		$key = $data['key'];
		$version = $data['version'];
		
		// Remove one search condition
		array_shift($data['conditions']);
		
		$name = $data['name'];
		$conditions = $data['conditions'];
		
		$response = API::userPut(
			self::$config['userID'],
			"searches/$key",
			json_encode($data),
			array(
				"Content-Type: application/json",
				"If-Unmodified-Since-Version: $version"
			)
		);
		$this->assert204($response);
		
		$data = API::getSearch($key, $this, 'json')['data'];
		$this->assertEquals($name, (string) $data['name']);
		$this->assertIsArray($data['conditions']);
		$this->assertCount(sizeOf($conditions), $data['conditions']);
		foreach ($conditions as $i => $condition) {
			foreach ($condition as $key => $val) {
				$this->assertEquals($val, $data['conditions'][$i][$key]);
			}
		}
	}
	
	
	public function testEditMultipleSearches() {
		$search1Name = "Test 1";
		$search1Conditions = [
			[
				"condition" => "title",
				"operator" => "contains",
				"value" => "test"
			]
		];
		$search1Data = API::createSearch($search1Name, $search1Conditions, $this, 'jsonData');
		$search1NewName = "Test 1 Modified";
		
		$search2Name = "Test 2";
		$search2Conditions = [
			[
				"condition" => "title",
				"operator" => "is",
				"value" => "test2"
			]
		];
		$search2Data = API::createSearch($search2Name, $search2Conditions, $this, 'jsonData');
		$search2NewConditions = [
			[
				"condition" => "title",
				"operator" => "isNot",
				"value" => "test1"
			]
		];
		
		$response = API::userPost(
			self::$config['userID'],
			"searches",
			json_encode([
				[
					'key' => $search1Data['key'],
					'version' => $search1Data['version'],
					'name' => $search1NewName
				],
				[
					'key' => $search2Data['key'],
					'version' => $search2Data['version'],
					'conditions' => $search2NewConditions
				]
			]),
			[
				"Content-Type: application/json"
			]
		);
		$this->assert200($response);
		$libraryVersion = $response->getHeader("Last-Modified-Version");
		$json = API::getJSONFromResponse($response);
		$this->assertCount(2, $json['successful']);
		// Deprecated
		$this->assertCount(2, $json['success']);
		
		// Check data in write response
		$this->assertEquals($json['successful'][0]['key'], $json['successful'][0]['data']['key']);
		$this->assertEquals($json['successful'][1]['key'], $json['successful'][1]['data']['key']);
		$this->assertEquals($libraryVersion, $json['successful'][0]['version']);
		$this->assertEquals($libraryVersion, $json['successful'][1]['version']);
		$this->assertEquals($libraryVersion, $json['successful'][0]['data']['version']);
		$this->assertEquals($libraryVersion, $json['successful'][1]['data']['version']);
		$this->assertEquals($search1NewName, $json['successful'][0]['data']['name']);
		$this->assertEquals($search2Name, $json['successful'][1]['data']['name']);
		$this->assertEquals($search1Conditions, $json['successful'][0]['data']['conditions']);
		$this->assertEquals($search2NewConditions, $json['successful'][1]['data']['conditions']);
		
		// Check in separate request, to be safe
		$keys = array_map(function ($o) {
			return $o['key'];
		}, $json['successful']);
		$response = API::getSearchResponse($keys);
		$this->assertTotalResults(2, $response);
		$json = API::getJSONFromResponse($response);
		// POST follows PATCH behavior, so unspecified values shouldn't change
		$this->assertEquals($search1NewName, $json[0]['data']['name']);
		$this->assertEquals($search1Conditions, $json[0]['data']['conditions']);
		$this->assertEquals($search2Name, $json[1]['data']['name']);
		$this->assertEquals($search2NewConditions, $json[1]['data']['conditions']);
	}
	
	
	public function testNewSearchNoName() {
		$json = API::createSearch(
			"",
			array(
				array(
					"condition" => "title",
					"operator" => "contains",
					"value" => "test"
				)
			),
			$this,
			'responseJSON'
		);
		$this->assert400ForObject($json, "Search name cannot be empty");
	}
	
	
	public function test_should_allow_a_search_with_emoji_values() {
		$json = API::createSearch(
			"🐶", // 4-byte character
			[
				[
					"condition" => "title",
					"operator" => "contains",
					"value" => "🐶" // 4-byte character
				]
			],
			$this,
			'responseJSON'
		);
		$this->assert200ForObject($json);
	}
	
	
	public function testNewSearchNoConditions() {
		$json = API::createSearch("Test", array(), $this, 'responseJSON');
		$this->assert400ForObject($json, "'conditions' cannot be empty");
	}
	
	
	public function testNewSearchConditionErrors() {
		$json = API::createSearch(
			"Test",
			array(
				array(
					"operator" => "contains",
					"value" => "test"
				)
			),
			$this,
			'responseJSON'
		);
		$this->assert400ForObject($json, "'condition' property not provided for search condition");
		
		$json = API::createSearch(
			"Test",
			array(
				array(
					"condition" => "",
					"operator" => "contains",
					"value" => "test"
				)
			),
			$this,
			'responseJSON'
		);
		$this->assert400ForObject($json, "Search condition cannot be empty");
		
		$json = API::createSearch(
			"Test",
			array(
				array(
					"condition" => "title",
					"value" => "test"
				)
			),
			$this,
			'responseJSON'
		);
		$this->assert400ForObject($json, "'operator' property not provided for search condition");
		
		$json = API::createSearch(
			"Test",
			array(
				array(
					"condition" => "title",
					"operator" => "",
					"value" => "test"
				)
			),
			$this,
			'responseJSON'
		);
		$this->assert400ForObject($json, "Search operator cannot be empty");
	}
}
